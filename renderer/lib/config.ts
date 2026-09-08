const client = process.env.NEXT_PUBLIC_CLIENT_NAME || 'nethu';

export const config = {
  clientName: client,
  logos: {
    light: client === 'nethu' ? '/nethu_logo_darkmode.png' : '/YiER1.jpg',
    dark: client === 'nethu' ? '/nethu_logo_transparent.png' : '/cjWtR-removebg-preview.png',
    // Always use light logo for print receipts as paper is white
    print: client === 'nethu' ? '/nethu_logo_transparent.png' : '/YiER1.jpg',
  }
};
