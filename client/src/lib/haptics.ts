import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNative } from "./platform";

export const haptics = {
  light: async () => {
    if (!isNative()) return;
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
  },
  medium: async () => {
    if (!isNative()) return;
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
  },
  heavy: async () => {
    if (!isNative()) return;
    try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
  },
  success: async () => {
    if (!isNative()) return;
    try { await Haptics.notification({ type: NotificationType.Success }); } catch {}
  },
  warning: async () => {
    if (!isNative()) return;
    try { await Haptics.notification({ type: NotificationType.Warning }); } catch {}
  },
  error: async () => {
    if (!isNative()) return;
    try { await Haptics.notification({ type: NotificationType.Error }); } catch {}
  },
};
