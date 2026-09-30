Put TWO sound files in this folder, named exactly:

  scan-success.mp3   -> plays for a CORRECT QR
  wrong-qr.mp3       -> plays for a WRONG / invalid QR

Nothing plays for "Already scanned" (only the popup with OK).
If a file is missing, a simple beep is played instead.
After adding/replacing files run:  npm run cap:sync
