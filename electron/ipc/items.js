const { ValidationError, NotFoundError, ConflictError } = require('../errors');
const { wrapHandler } = require('./wrap');

const LOW_STOCK_THRESHOLD = 10; // flat constant for now; can become configurable later

function slugifyModel(bikeModel) {
  return bikeModel
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
}

function generateSku(db, bikeModel, type) {
  const modelCode = slugifyModel(bikeModel);
  const typeRow = db.prepare('SELECT code FROM item_types WHERE name = ?').get(type);
  if (!typeRow) throw new ValidationError(`Invalid type: ${type}`);
  const typeCode = typeRow.code;
  const prefix = `${modelCode}-${typeCode}-`;

  // Use numeric MAX to find the highest sequence, not alphabetical sort
  const row = db
    .prepare('SELECT MAX(CAST(SUBSTR(sku, ?) AS INTEGER)) AS max_seq FROM items WHERE sku LIKE ?')
    .get(prefix.length + 1, `${prefix}%`);

  const nextSeq = (row?.max_seq || 0) + 1;
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

function registerItemsHandlers(ipcMain, getDb) {
  ipcMain.handle(
    'items:list',
    wrapHandler(({ page = 1, pageSize = 50, search, type, bikeModel, dateFrom, dateTo } = {}) => {
      const db = getDb();
      const safePageSize = Math.min(pageSize || 50, 200);
      const safePage = Math.max(page || 1, 1);
      const offset = (safePage - 1) * safePageSize;

      console.log(`BACKEND -> Received items:list request for page ${safePage}, pageSize ${safePageSize}`);

      const conditions = ['is_active = 1'];
      const params = [];

      if (search) {
        conditions.push('(name LIKE ? OR sku LIKE ? OR bike_model LIKE ?)');
        const term = `%${search}%`;
        params.push(term, term, term);
      }
      if (type) {
        conditions.push('type = ?');
        params.push(type);
      }
      if (bikeModel) {
        conditions.push('bike_model = ?');
        params.push(bikeModel);
      }
      if (dateFrom) {
        conditions.push('created_at >= ?');
        params.push(dateFrom + ' 00:00:00');
      }
      if (dateTo) {
        conditions.push('created_at <= ?');
        params.push(dateTo + ' 23:59:59');
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const totalRow = db
        .prepare(`SELECT COUNT(*) as count FROM items ${whereClause}`)
        .get(...params);

      const items = db
        .prepare(
          `SELECT i.*, i.unit_price AS current_price
          FROM items i
          ${whereClause}
          ORDER BY i.created_at DESC
          LIMIT ? OFFSET ?`
        )
        .all(...params, safePageSize, offset);

      return {
        items: items.map((i) => ({ ...i, isLowStock: i.stock_count <= LOW_STOCK_THRESHOLD })),
        total: totalRow.count,
        page: safePage,
        pageSize: safePageSize,
      };
    })
  );

  ipcMain.handle(
    'items:get',
    wrapHandler(({ itemId }) => {
      const db = getDb();
      const item = db.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId);
      if (!item) throw new NotFoundError('Item not found.');

      const batches = db
        .prepare('SELECT * FROM batches WHERE item_id = ? ORDER BY production_date DESC, batch_id DESC')
        .all(itemId);

      return { ...item, batches };
    })
  );

  ipcMain.handle(
    'items:create',
    wrapHandler(({ name, bikeModel, type, description, unitCost, unitPrice, costRexine, costLabor, costEmboss, costThread, costPacking, costCover, costNamePrinting, costPunch, costWire, costPackingLabor, costOther }) => {
      if (!name || !name.trim()) throw new ValidationError('Item name is required.');
      if (!bikeModel || !bikeModel.trim()) throw new ValidationError('Bike model is required.');
      const db = getDb();

      const typeRow = db.prepare('SELECT * FROM item_types WHERE name = ?').get(type);
      if (!typeRow) throw new ValidationError('Invalid type selected.');
      if (unitPrice == null || Number(unitPrice) < 0) throw new ValidationError('Selling price is required and cannot be negative.');
      if (unitCost != null && Number(unitCost) < 0) throw new ValidationError('Production cost cannot be negative.');

      const hasBreakdown = costRexine != null || costLabor != null || costEmboss != null || costThread != null || costPacking != null || costCover != null || costNamePrinting != null || costPunch != null || costWire != null || costPackingLabor != null || costOther != null;
      const finalUnitCost = hasBreakdown ? 
        (Number(costRexine) || 0) + (Number(costLabor) || 0) + (Number(costEmboss) || 0) + (Number(costThread) || 0) + (Number(costPacking) || 0) + (Number(costCover) || 0) + (Number(costNamePrinting) || 0) + (Number(costPunch) || 0) + (Number(costWire) || 0) + (Number(costPackingLabor) || 0) + (Number(costOther) || 0) 
        : (unitCost || 0);
      const sku = generateSku(db, bikeModel, type);

      const result = db
        .prepare(
          `INSERT INTO items (
            sku, name, bike_model, type, description, stock_count, is_active, 
            unit_cost, unit_price, cost_rexine, cost_labor, cost_emboss, cost_thread, cost_packing, cost_cover, cost_name_printing, cost_punch, cost_wire, cost_packing_labor, cost_other, old_type
          )
           VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SEAT')`
        )
        .run(
          sku, name.trim(), bikeModel.trim(), type, description || null, finalUnitCost, unitPrice,
          costRexine ?? null, costLabor ?? null, costEmboss ?? null, costThread ?? null, costPacking ?? null, costCover ?? null,
          costNamePrinting ?? null, costPunch ?? null, costWire ?? null, costPackingLabor ?? null, costOther ?? null
        );

      return db.prepare('SELECT * FROM items WHERE item_id = ?').get(result.lastInsertRowid);
    })
  );

  ipcMain.handle(
    'items:update',
    wrapHandler(({ itemId, name, bikeModel, type, description, unitCost, unitPrice, costRexine, costLabor, costEmboss, costThread, costPacking, costCover, costNamePrinting, costPunch, costWire, costPackingLabor, costOther }) => {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId);
      if (!existing) throw new NotFoundError('Item not found.');

      if (type) {
        const typeRow = db.prepare('SELECT * FROM item_types WHERE name = ?').get(type);
        if (!typeRow) throw new ValidationError('Invalid type selected.');
      }
      if (unitPrice != null && Number(unitPrice) < 0) throw new ValidationError('Selling price cannot be negative.');
      if (unitCost != null && Number(unitCost) < 0) throw new ValidationError('Production cost cannot be negative.');

      const hasBreakdown = costRexine !== undefined || costLabor !== undefined || costEmboss !== undefined || costThread !== undefined || costPacking !== undefined || costCover !== undefined || costNamePrinting !== undefined || costPunch !== undefined || costWire !== undefined || costPackingLabor !== undefined || costOther !== undefined;
      let finalUnitCost = unitCost !== undefined ? unitCost : existing.unit_cost;
      if (hasBreakdown) {
        finalUnitCost = 
          (Number(costRexine !== undefined ? costRexine : existing.cost_rexine) || 0) + 
          (Number(costLabor !== undefined ? costLabor : existing.cost_labor) || 0) + 
          (Number(costEmboss !== undefined ? costEmboss : existing.cost_emboss) || 0) + 
          (Number(costThread !== undefined ? costThread : existing.cost_thread) || 0) + 
          (Number(costPacking !== undefined ? costPacking : existing.cost_packing) || 0) + 
          (Number(costCover !== undefined ? costCover : existing.cost_cover) || 0) + 
          (Number(costNamePrinting !== undefined ? costNamePrinting : existing.cost_name_printing) || 0) + 
          (Number(costPunch !== undefined ? costPunch : existing.cost_punch) || 0) + 
          (Number(costWire !== undefined ? costWire : existing.cost_wire) || 0) + 
          (Number(costPackingLabor !== undefined ? costPackingLabor : existing.cost_packing_labor) || 0) + 
          (Number(costOther !== undefined ? costOther : existing.cost_other) || 0);
      }

      db.prepare(
        `UPDATE items SET
          name = ?,
          bike_model = ?,
          type = ?,
          description = ?,
          unit_cost = ?,
          unit_price = ?,
          cost_rexine = ?,
          cost_labor = ?,
          cost_emboss = ?,
          cost_thread = ?,
          cost_packing = ?,
          cost_cover = ?,
          cost_name_printing = ?,
          cost_punch = ?,
          cost_wire = ?,
          cost_packing_labor = ?,
          cost_other = ?,
          updated_at = datetime('now')
        WHERE item_id = ?`
      ).run(
        name?.trim() || existing.name,
        bikeModel?.trim() || existing.bike_model,
        type || existing.type,
        description !== undefined ? description : existing.description,
        finalUnitCost,
        unitPrice !== undefined ? unitPrice : existing.unit_price,
        costRexine !== undefined ? costRexine : existing.cost_rexine,
        costLabor !== undefined ? costLabor : existing.cost_labor,
        costEmboss !== undefined ? costEmboss : existing.cost_emboss,
        costThread !== undefined ? costThread : existing.cost_thread,
        costPacking !== undefined ? costPacking : existing.cost_packing,
        costCover !== undefined ? costCover : existing.cost_cover,
        costNamePrinting !== undefined ? costNamePrinting : existing.cost_name_printing,
        costPunch !== undefined ? costPunch : existing.cost_punch,
        costWire !== undefined ? costWire : existing.cost_wire,
        costPackingLabor !== undefined ? costPackingLabor : existing.cost_packing_labor,
        costOther !== undefined ? costOther : existing.cost_other,
        itemId
      );

      return db.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId);
    })
  );

  ipcMain.handle(
    'items:archive',
    wrapHandler(({ itemId }) => {
      const db = getDb();
      const existing = db.prepare('SELECT * FROM items WHERE item_id = ?').get(itemId);
      if (!existing) throw new NotFoundError('Item not found.');

      const batchCount = db.prepare('SELECT COUNT(*) as count FROM batches WHERE item_id = ?').get(itemId).count;
      const salesCount = db
        .prepare('SELECT COUNT(*) as count FROM sales_order_items WHERE item_id = ?')
        .get(itemId).count;

      if (batchCount > 0 || salesCount > 0) {
        throw new ConflictError('Cannot archive this item: it already has production or sales history.');
      }

      db.prepare("UPDATE items SET is_active = 0, updated_at = datetime('now') WHERE item_id = ?").run(itemId);

      return { itemId, archived: true };
    })
  );

  ipcMain.handle(
    'items:listTypes',
    wrapHandler(({ search } = {}) => {
      const db = getDb();
      let query = `
        SELECT it.name, it.code, COUNT(i.item_id) as item_count 
        FROM item_types it 
        LEFT JOIN items i ON i.type = it.name AND i.is_active = 1
      `;
      const params = [];
      if (search) {
        query += ' WHERE it.name LIKE ? OR it.code LIKE ?';
        const term = `%${search}%`;
        params.push(term, term);
      }
      query += ' GROUP BY it.name, it.code ORDER BY it.name ASC';
      const types = db.prepare(query).all(...params);
      return { types };
    })
  );

  ipcMain.handle(
    'items:createType',
    wrapHandler(({ name }) => {
      if (!name || !name.trim()) throw new ValidationError('Type name is required.');
      const typeName = name.trim();
      
      const db = getDb();
      const existing = db.prepare('SELECT * FROM item_types WHERE name = ? COLLATE NOCASE').get(typeName);
      if (existing) throw new ConflictError('Type already exists.');

      // Generate base code
      const baseCode = typeName.split(' ').map(w => w[0]).join('').toUpperCase().replace(/[^A-Z]/g, '') || 'TY';
      
      // Add random 3 digits (100 to 999)
      let typeCode = '';
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 10) {
        const randomNum = Math.floor(Math.random() * 900) + 100;
        typeCode = `${baseCode.substring(0, 2)}${randomNum}`;
        const existingCode = db.prepare('SELECT * FROM item_types WHERE code = ?').get(typeCode);
        if (!existingCode) isUnique = true;
        attempts++;
      }
      
      if (!isUnique) throw new ConflictError('Could not generate a unique code. Please try again.');

      const result = db.prepare('INSERT INTO item_types (name, code) VALUES (?, ?)').run(typeName, typeCode);
      return db.prepare('SELECT * FROM item_types WHERE type_id = ?').get(result.lastInsertRowid);
    })
  );

  ipcMain.handle(
    'items:deleteType',
    wrapHandler(({ name }) => {
      const db = getDb();
      
      const countRow = db.prepare('SELECT COUNT(*) as count FROM items WHERE type = ?').get(name);
      if (countRow.count > 0) {
        throw new ConflictError(`Cannot delete type '${name}' because it has ${countRow.count} items associated with it.`);
      }

      const result = db.prepare('DELETE FROM item_types WHERE name = ?').run(name);
      if (result.changes === 0) throw new NotFoundError('Type not found.');
      return { success: true };
    })
  );
}

module.exports = { registerItemsHandlers };
