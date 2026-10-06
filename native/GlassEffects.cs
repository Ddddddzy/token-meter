using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;

public sealed class GlassFrame {
  public Rectangle Bounds;
  public string DataUrl, Fingerprint;
  public double WorkMilliseconds;
  public int WorkerThreadId;
}

// The blurred background is created BEFORE it reaches WebView2. CSS cannot
// blur windows outside its own compositor; tint/opacity must not weaken blur.
public static class GlassEffects {
  // No PowerShell callback runs on the worker. The UI polls one bounded task,
  // which never waits for the token-scanning server or writes screenshots to disk.
  public static Task<GlassFrame> CaptureAsync(Rectangle bounds, double dpi) {
    return Task.Factory.StartNew(() => {
      var clock = Stopwatch.StartNew();
      using (var bitmap = Capture(bounds, dpi)) {
        var frame = Encode(bitmap, bounds);
        frame.WorkMilliseconds = clock.Elapsed.TotalMilliseconds;
        frame.WorkerThreadId = Thread.CurrentThread.ManagedThreadId;
        return frame;
      }
    }, CancellationToken.None, TaskCreationOptions.None, TaskScheduler.Default);
  }
  public static GlassFrame Encode(Bitmap bitmap, Rectangle bounds) {
    ImageCodecInfo jpeg = null;
    foreach (var codec in ImageCodecInfo.GetImageEncoders()) {
      if (codec.MimeType == "image/jpeg") { jpeg = codec; break; }
    }
    if (jpeg == null) throw new InvalidOperationException("JPEG encoder unavailable.");
    using (var stream = new MemoryStream())
    using (var parameters = new EncoderParameters(1)) {
      parameters.Param[0] = new EncoderParameter(Encoder.Quality, 55L);
      bitmap.Save(stream, jpeg, parameters);
      var bytes = stream.ToArray();
      using (var hash = MD5.Create()) {
        return new GlassFrame {
          Bounds = bounds,
          DataUrl = "data:image/jpeg;base64," + Convert.ToBase64String(bytes),
          Fingerprint = Convert.ToBase64String(hash.ComputeHash(bytes))
        };
      }
    }
  }
  public static Bitmap Capture(Rectangle bounds, double dpi) {
    using (var screen = new Bitmap(bounds.Width, bounds.Height)) {
      using (var g = Graphics.FromImage(screen)) {
        g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
      }
      int step = Math.Max(2, (int)Math.Round(dpi * 2));
      using (var sample = new Bitmap(Math.Max(1, bounds.Width / step), Math.Max(1, bounds.Height / step), PixelFormat.Format32bppArgb)) {
        using (var g = Graphics.FromImage(sample)) {
          g.InterpolationMode = InterpolationMode.HighQualityBilinear;
          g.DrawImage(screen, 0, 0, sample.Width, sample.Height);
        }
        // Match the former native + CSS blur in one pass pipeline. The browser
        // receives fully frosted pixels and only composites their opacity.
        return Blur(sample, 10);
      }
    }
  }
  // Three separable box passes approximate a Gaussian. Sliding sums keep each
  // pass O(width*height), independent of radius; no per-pixel GDI calls.
  public static Bitmap Blur(Bitmap image, int radius) {
    if (radius < 1) throw new ArgumentOutOfRangeException("radius");
    int w = image.Width, h = image.Height;
    var result = new Bitmap(w, h, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(result)) { g.DrawImageUnscaled(image, 0, 0); }
    var data = result.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    try {
      var a = new byte[w * h * 4];
      var b = new byte[a.Length];
      for (int y = 0; y < h; y++) Marshal.Copy(IntPtr.Add(data.Scan0, y * data.Stride), a, y * w * 4, w * 4);
      for (int pass = 0; pass < 3; pass++) {
        Box(a, b, w, h, radius, true);
        Box(b, a, w, h, radius, false);
      }
      for (int y = 0; y < h; y++) Marshal.Copy(a, y * w * 4, IntPtr.Add(data.Scan0, y * data.Stride), w * 4);
    } finally { result.UnlockBits(data); }
    return result;
  }
  static void Box(byte[] src, byte[] dst, int w, int h, int radius, bool horizontal) {
    int length = horizontal ? w : h, rows = horizontal ? h : w, count = radius * 2 + 1;
    for (int row = 0; row < rows; row++) {
      for (int channel = 0; channel < 4; channel++) {
        int sum = 0;
        for (int offset = -radius; offset <= radius; offset++) {
          int pos = Math.Max(0, Math.Min(length - 1, offset));
          sum += src[(horizontal ? row * w + pos : pos * w + row) * 4 + channel];
        }
        for (int pos = 0; pos < length; pos++) {
          int index = (horizontal ? row * w + pos : pos * w + row) * 4 + channel;
          dst[index] = (byte)((sum + count / 2) / count);
          int remove = Math.Max(0, pos - radius), add = Math.Min(length - 1, pos + radius + 1);
          sum += src[(horizontal ? row * w + add : add * w + row) * 4 + channel] - src[(horizontal ? row * w + remove : remove * w + row) * 4 + channel];
        }
      }
    }
  }
  public static double Ease(double progress) {
    progress = Math.Max(0, Math.Min(1, progress));
    // Smoothstep starts and ends at zero velocity, avoiding a bright first
    // frame when WinForms delivers its first timer tick a little late.
    return progress * progress * (3 - 2 * progress);
  }
}
