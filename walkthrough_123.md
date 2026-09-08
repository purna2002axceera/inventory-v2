# 🛡️ Hardware ID (HWID) Licensing Implementation

The anti-piracy hardware lock is now fully integrated into the Inventory System. 

## 1. What was built
- **Hardware Scanner:** Installed `node-machine-id` to securely read the physical serial numbers of the motherboard and CPU.
- **Cryptographic Core:** Added `electron/license-utils.js` which hashes the hardware ID and compares it against an encrypted `SECRET_SALT` to mathematically verify licenses.
- **Frontend Guard:** Created `<LicenseGuard>` which wraps your entire React application. If the app detects an invalid or missing license, it completely intercepts the boot process and displays an impenetrable Activation Screen.
- **Developer Generator:** Created a standalone script `generate-key.js` that only you possess, which generates valid keys.

## 2. How to test it right now
You can test this right now on your computer!

1. Open your terminal in the `inventory-app` folder and start the app: `npm run dev`
2. The app will boot up, but instead of the login screen, you will be hit with the **Software Activation** lock screen! 
3. It will display your computer's unique Machine ID (e.g., `MACH-A1B2C3D4`). **Click the copy button next to it.**
4. Open a *new* terminal window (leave the app running), and run your secret generator script:
   ```bash
   node generate-key.js <PASTE_YOUR_MACHINE_ID_HERE>
   ```
5. The terminal will spit out a 16-character License Key.
6. Paste that License Key into the app and click **Activate Software**.

The app will permanently unlock for your computer and let you through to the login screen!

> [!TIP]
> If you ever want to test the lock screen again, you can force the app to "forget" your license by deleting the `license.json` file located in your `%APPDATA%\Inventory System` folder.
