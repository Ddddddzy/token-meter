using System;
using System.Runtime.InteropServices;

// Capture exclusion is needed only for our live backdrop sampler. Suspend it
// BEFORE the OS snipping hotkey runs, without swallowing or storing keystrokes.
public sealed class ScreenshotGuard : IDisposable {
  delegate IntPtr KeyboardProc(int code, IntPtr message, IntPtr data);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowsHookEx(int kind, KeyboardProc callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
  [DllImport("kernel32.dll", CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll", SetLastError=true)] static extern bool SetWindowDisplayAffinity(IntPtr window, uint affinity);
  [DllImport("user32.dll", SetLastError=true)] static extern bool GetWindowDisplayAffinity(IntPtr window, out uint affinity);
  [DllImport("dwmapi.dll")] static extern int DwmFlush();
  readonly IntPtr window;
  readonly KeyboardProc callback;
  IntPtr hook;
  public bool Suspended { get; private set; }
  public int Epoch { get; private set; }
  public int LastAffinityError { get; private set; }
  public int HookInstallationError { get; private set; }
  public bool HookInstalled { get { return hook != IntPtr.Zero; } }
  public ScreenshotGuard(IntPtr window) {
    this.window=window; callback=OnKeyboard;
    hook=SetWindowsHookEx(13,callback,GetModuleHandle(null),0);
    // Keep the tray usable if security software prevents global hooks. The
    // explicit tray screenshot mode still works without a keyboard hook.
    if(hook==IntPtr.Zero) HookInstallationError=Marshal.GetLastWin32Error();
  }
  public static bool IsCaptureHotkey(int key, bool windows, bool shift, bool alt) {
    // Alt+A also covers Ctrl+Alt+A. Other/custom shortcuts use the tray menu.
    return key==0x2C || (key==0x53 && windows && shift) || (key==0x41 && alt);
  }
  IntPtr OnKeyboard(int code, IntPtr message, IntPtr data) {
    try { if(code>=0 && (message.ToInt64()==0x100 || message.ToInt64()==0x104)) {
      int key=Marshal.ReadInt32(data);
      bool windows=(GetAsyncKeyState(0x5B)&0x8000)!=0 || (GetAsyncKeyState(0x5C)&0x8000)!=0;
      bool shift=(GetAsyncKeyState(0x10)&0x8000)!=0;
      bool alt=(GetAsyncKeyState(0x12)&0x8000)!=0;
      if(IsCaptureHotkey(key,windows,shift,alt) && IsWindowVisible(window)) Suspend();
    } } catch { /* Never interrupt another application's keyboard input. */ }
    return CallNextHookEx(hook,code,message,data);
  }
  public void Suspend() {
    if(!Suspended) { Suspended=true; Epoch++; }
    SetExcluded(false);
    // Finish compositor changes before passing the hotkey to the OS.
    DwmFlush();
  }
  public void Resume() { if(Suspended) { Suspended=false; Epoch++; } SetExcluded(IsWindowVisible(window)); }
  public void SetExcluded(bool excluded) {
    bool success=SetWindowDisplayAffinity(window,excluded && !Suspended ? 0x11u : 0u);
    LastAffinityError=success ? 0 : Marshal.GetLastWin32Error();
  }
  public uint Affinity { get { uint value; return GetWindowDisplayAffinity(window,out value) ? value : UInt32.MaxValue; } }
  public void Dispose() {
    if(hook!=IntPtr.Zero) { UnhookWindowsHookEx(hook); hook=IntPtr.Zero; }
    SetExcluded(false);
    GC.KeepAlive(callback);
  }
}
