import {QRCodeCanvas} from 'qrcode.react';

/** A QR code on a white card (readable in both themes). */
export function Qr({value, size = 200}: {value: string; size?: number}) {
  return (
    <div className="qr-box">
      <QRCodeCanvas value={value} size={size} level="M" marginSize={0} />
    </div>
  );
}
