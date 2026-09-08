const bcrypt = require('bcryptjs');

function registerAuthHandlers(ipcMain, getDb) {
  ipcMain.handle('auth:login', (event, { username, password }) => {
    try {
      if (!username || !password) {
        return {
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Username and password are required.' },
        };
      }

      const db = getDb();
      const user = db
        .prepare('SELECT user_id, username, password_hash, full_name FROM users WHERE username = ?')
        .get(username);

      if (!user) {
        return {
          ok: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' },
        };
      }

      const passwordMatches = bcrypt.compareSync(password, user.password_hash);

      if (!passwordMatches) {
        return {
          ok: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' },
        };
      }

      return {
        ok: true,
        data: {
          userId: user.user_id,
          username: user.username,
          fullName: user.full_name,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: { code: 'DATABASE_ERROR', message: err.message },
      };
    }
  });
}

module.exports = { registerAuthHandlers };
