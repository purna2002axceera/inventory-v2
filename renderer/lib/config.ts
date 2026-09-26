const client = process.env.NEXT_PUBLIC_CLIENT_NAME || 'nethu';

export const config = {
  clientName: client,
  logos: {
    light: client === 'nethu' ? '/nethu_logo_darkmode.png' : '/impress_logo_light_mode.jpg',
    dark: client === 'nethu' ? '/nethu_logo_transparent.png' : '/impress_logo_dark_mode.png',
    // Always use light logo for print receipts as paper is white
    print: client === 'nethu' ? '/nethu_logo_transparent.png' : '/impress_logo_light_mode.jpg',
  },
  businessDetails: client === 'nethu' ? {
    name: 'Nethu Enterprises',
    address: 'No 164/A, Nadungolla, Mandawala',
    phones: ['0766277250', '0716368939'],
    email: 'nilankadarmapala6@gmail.com',
    regNo: 'WN 6506',
  } : {
    name: 'Impress Enterprise',
    address: 'No. 25/25, Pansalhena Road, Kolonnawa',
    phones: [],
    email: 'impressseat@gmail.com',
  },
};
