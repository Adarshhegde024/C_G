import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { LocalNotifications } from "@capacitor/local-notifications";

/**
 * Check if running inside native Android or iOS Capacitor wrapper
 */
export const isNative = Capacitor.isNativePlatform();

/**
 * Initialize native device capabilities on app mount
 */
export async function initNativeFeatures(): Promise<void> {
  if (!isNative) return;

  try {
    // Edge-to-edge dark status bar matching CloudGuard theme
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0D0F17" });
  } catch (err) {
    console.debug("Native status bar initialization skipped:", err);
  }

  try {
    // Hide native splash screen once DOM is ready
    await SplashScreen.hide({ fadeOutDuration: 400 });
  } catch (err) {
    console.debug("Native splash screen initialization skipped:", err);
  }
}

/**
 * Tactile haptic feedback for user interactions (buttons, vault actions)
 */
export async function triggerHaptic(
  type: "light" | "medium" | "heavy" | "success" | "warning" | "error" = "light"
): Promise<void> {
  if (!isNative) {
    // Browser fallback via navigator.vibrate if supported
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      if (type === "success") navigator.vibrate([40, 60, 40]);
      else if (type === "error" || type === "warning") navigator.vibrate([80, 50, 80]);
      else navigator.vibrate(25);
    }
    return;
  }

  try {
    if (type === "light") await Haptics.impact({ style: ImpactStyle.Light });
    else if (type === "medium") await Haptics.impact({ style: ImpactStyle.Medium });
    else if (type === "heavy") await Haptics.impact({ style: ImpactStyle.Heavy });
    else if (type === "success") await Haptics.notification({ type: NotificationType.Success });
    else if (type === "warning") await Haptics.notification({ type: NotificationType.Warning });
    else if (type === "error") await Haptics.notification({ type: NotificationType.Error });
  } catch {
    // Haptics unavailable on device
  }
}

/**
 * Capture high-resolution photo using device camera or photo library
 */
export async function captureNativePhoto(
  source: "camera" | "photos" = "camera"
): Promise<{ dataUrl?: string; format?: string } | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    });
    return { dataUrl: photo.dataUrl, format: photo.format };
  } catch (err) {
    console.debug("Photo capture cancelled or denied:", err);
    return null;
  }
}

/**
 * Schedule local notifications for check-in deadlines
 */
export async function scheduleCheckInNotification(
  deadlineDate: Date,
  title = "CloudGuard Check-In Required",
  body = "Your proof-of-life check-in deadline is approaching. Tap to verify."
): Promise<boolean> {
  if (!isNative) return false;

  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return false;

    // Schedule 24 hours before deadline, or immediately if less than 24h
    const triggerAt = new Date(deadlineDate.getTime() - 24 * 60 * 60 * 1000);
    const scheduleDate = triggerAt > new Date() ? triggerAt : new Date(Date.now() + 60 * 1000);

    await LocalNotifications.schedule({
      notifications: [
        {
          id: 1001,
          title,
          body,
          schedule: { at: scheduleDate },
          sound: "beep.wav",
          extra: { route: "/check-in" },
        },
      ],
    });
    return true;
  } catch (err) {
    console.debug("Local notification scheduling skipped:", err);
    return false;
  }
}
