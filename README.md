# City Lifestyle - QR Scanner APK

Minimal app: fakt 2 screen -
1. **Login** (`/auth/login` - same backend tamara CityLifestyle project no)
2. **QR Scanner** - camera scanning chalu hoy tyare frame **RED**, QR successfully
   read thay etle **GREEN** + "QR Scanned Successfully!" message, pachi
   automatic backend ne check-in call thay ane 2.2 second pachi fari
   scanning (RED) chalu thai jay.

---

## 1) Local machine par setup (Node.js 18+ joise)

```bash
cd qr-scanner-app
npm install
cp .env.example .env
```

`.env` file kholo ane tamara REAL deployed backend no URL nakho:

```
VITE_API_BASE_URL=https://your-backend-domain.com/api
```

> ⚠️ `localhost` NA rakhso — phone pote localhost access nathi kari shakto.
> Backend har hamesha public URL (HTTPS) par deploy hoy tevu joiye.

Test karva mate (browser ma):

```bash
npm run dev
```

---

## 2) APK banavva mate - Capacitor add karo

```bash
npx cap init "City Lifestyle QR Scanner" "com.citylifestyle.qrscanner" --web-dir=dist
npm run build
npx cap add android
npx cap copy android
```

(`capacitor.config.json` already project ma che, so `cap init` sirf confirm
karse — tame appId/appName tamari marji mujab badli shako chho.)

### Camera permission add karo

`android/app/src/main/AndroidManifest.xml` file kholo ane
`</manifest>` tag ni UPAR (existing `<uses-permission android:name="android.permission.INTERNET" />`
line ni niche j) aa 2 lines add karo:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="true" />
```

### Android Studio ma kholo ane APK banavo

```bash
npx cap open android
```

Android Studio khulshe -> **Build > Build Bundle(s) / APK(s) > Build APK(s)**
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk` — aa file
  directly phone par install kari testing kari shakay.
- Play Store / production mate: **Build > Generate Signed Bundle / APK**
  thi keystore banavi ne signed release APK/AAB banavvu pade.

---

## 3) Real phone par test

1. Debug APK phone ma transfer karo (USB / WhatsApp / Drive)
2. Install karo (Unknown sources allow karvu pade)
3. App kholo -> Login karo (same admin/staff credentials je backend
   ma valid chhe)
4. Scanner screen khulshe, camera permission allow karo
5. Koi ticket no QR scan karo:
   - Scanning drmiyaan frame **RED** dekhashe
   - QR successfully read thata j frame **GREEN** thai jashe + message
     "QR Scanned Successfully!"
   - Backend check-in call thai ne entry allow / already used / invalid
     jevu status niche message ma update thashe
   - ~2 second pachi automatic fari scanning (RED) chalu

---

## Files/logic je customize kari shakay

- `src/pages/Scanner.jsx` — red/green logic, reset delay
  (`RESET_DELAY_MS`), beep sound
- `src/pages/Scanner.css` — frame no color/size/animation
- `src/context/AuthContext.jsx` — login response no exact shape (`token`,
  `user`) tamara backend na actual `/auth/login` response mujab check kari
  levu — jaruriyat pade to lines adjust karo
- `src/services/qrService.js` — `/qr/verify` ane `/qr/check-in` — aa j
  endpoints tamara existing backend (`backend/controllers/qr.controller.js`)
  ma already banela chhe, koi badlav ni jaroor nathi
