import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { buildKhqr, formatMinor, khqrAccountFromSettings, type SavingsGoal } from '@pla/shared';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useOwner } from '@/contexts/AuthContext';
import { t } from '@/i18n';

const QR_PX = 520;
const VALID_HOURS = 24;

/** Full-screen KHQR for a goal's daily amount, rendered as a PNG you can save or share. */
export function KhqrImage({ goal, onClose }: { goal: SavingsGoal; onClose: () => void }) {
  const me = useOwner();
  const st = me.settings;
  const qrRef = useRef<HTMLDivElement>(null);
  const [png, setPng] = useState<string>();
  const [error, setError] = useState<string>();

  const built = useMemo(() => {
    try {
      const at = new Date();
      const value = buildKhqr({
        account: khqrAccountFromSettings(st),
        currency: goal.currency,
        amount_minor: goal.daily_requirement_minor,
        note: goal.name,
        now: at,
        expires_in_minutes: VALID_HOURS * 60,
      });
      return { value, until: new Date(at.getTime() + VALID_HOURS * 3_600_000) };
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not create the QR'));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal.id, goal.daily_requirement_minor, goal.currency]);

  const amount = formatMinor(goal.daily_requirement_minor, goal.currency);
  const fileName = `khqr-${goal.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${amount.replace(/[^\d.]/g, '')}.png`;

  // compose the shareable card (title, QR, amount, account) into a single PNG
  useEffect(() => {
    const qr = qrRef.current?.querySelector('canvas');
    if (!built || !qr) return;
    const W = 720;
    const H = 960;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    if (!g) return;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#0f172a';
    g.textAlign = 'center';
    g.font = '700 40px system-ui, sans-serif';
    g.fillText(goal.name.slice(0, 28), W / 2, 90);
    g.fillStyle = '#64748b';
    g.font = '500 28px system-ui, sans-serif';
    g.fillText(t('Daily saving'), W / 2, 140);
    g.drawImage(qr, (W - QR_PX) / 2, 190, QR_PX, QR_PX);
    g.fillStyle = '#0f172a';
    g.font = '800 72px system-ui, sans-serif';
    g.fillText(amount, W / 2, 840);
    g.fillStyle = '#64748b';
    g.font = '500 26px system-ui, sans-serif';
    g.fillText(`${st.bakong_merchant_name ?? ''} · KHQR`, W / 2, 886);
    g.fillText(t('Valid until {0}', built.until.toLocaleString()), W / 2, 926);
    setPng(c.toDataURL('image/png'));
  }, [built, goal.name, amount, st.bakong_merchant_name]);

  async function toFile(): Promise<File | null> {
    if (!png) return null;
    const blob = await (await fetch(png)).blob();
    return new File([blob], fileName, { type: 'image/png' });
  }

  async function saveImage() {
    const file = await toFile();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast.success(t('Image saved'));
  }

  async function share() {
    const file = await toFile();
    if (!file) return;
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: goal.name });
        return;
      }
    } catch {
      return; // cancelled
    }
    void saveImage();
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <p className="truncate text-base font-extrabold">{goal.name}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Close')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/[0.08]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-4">
        {/* hidden source canvas for the QR */}
        <div ref={qrRef} className="hidden" aria-hidden>
          {built && <QRCodeCanvas value={built.value} size={QR_PX} level="M" marginSize={2} />}
        </div>
        {error && <p className="text-center text-sm font-semibold text-danger">{error}</p>}
        {png && (
          <img src={png} alt={t('KHQR for {0}', amount)} className="max-h-[68vh] w-auto max-w-full rounded-3xl shadow-xl" />
        )}
        <p className="text-center text-xs text-muted-foreground">
          {t('Scan with any Bakong / bank app. Press and hold the image to save it, or use the buttons below.')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pb-6 pt-3">
        <Button variant="secondary" size="lg" disabled={!png} onClick={() => void share()}>
          <Share2 className="mr-2 h-4 w-4" /> {t('Share')}
        </Button>
        <Button size="lg" disabled={!png} onClick={() => void saveImage()}>
          <Download className="mr-2 h-4 w-4" /> {t('Save image')}
        </Button>
      </div>
    </div>
  );
}
