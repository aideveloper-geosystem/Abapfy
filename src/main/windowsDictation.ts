import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BrowserWindow } from 'electron'

export async function openWindowsDictation(window: BrowserWindow): Promise<void> {
  if (process.platform !== 'win32')
    throw new Error(
      'O ditado Windows está disponível somente no Windows. Use Win + H no campo de mensagem.'
    )
  if (!window.isFocused()) throw new Error('Clique no campo de mensagem antes de iniciar o ditado.')
  const handle = window.getNativeWindowHandle()
  const hwnd =
    handle.length >= 8 ? handle.readBigUInt64LE().toString() : handle.readUInt32LE().toString()
  const script = `
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AbapfyDictation {
  [StructLayout(LayoutKind.Sequential)] public struct Input { public uint type; public Union u; }
  [StructLayout(LayoutKind.Explicit)] public struct Union { [FieldOffset(0)] public Keyboard key; [FieldOffset(0)] public Mouse mouse; }
  [StructLayout(LayoutKind.Sequential)] public struct Keyboard { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct Mouse { public int x, y; public uint data, flags, time; public UIntPtr extra; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count, Input[] inputs, int size);
  static Input Key(ushort vk, bool up) { return new Input { type=1, u=new Union { key=new Keyboard { vk=vk, flags=up ? 2u : 0u } } }; }
  public static void Open(long hwnd) {
    if (GetForegroundWindow() != new IntPtr(hwnd)) throw new Exception("O Abapfy perdeu o foco. Use Win + H no campo de mensagem.");
    foreach (int key in new [] {16,17,18,91,92}) if ((GetAsyncKeyState(key) & 0x8000) != 0) throw new Exception("Solte as teclas modificadoras e tente novamente.");
    int size=Marshal.SizeOf(typeof(Input));
    if (size != (IntPtr.Size == 8 ? 40 : 28)) throw new Exception("Estrutura de entrada Windows inválida.");
    uint sent=SendInput(4, new [] {Key(91,false),Key(72,false),Key(72,true),Key(91,true)},size);
    if (sent != 4) { SendInput(2,new [] {Key(72,true),Key(91,true)},size); throw new Exception("Windows recusou o atalho. Use Win + H manualmente."); }
  }
}
'@
[AbapfyDictation]::Open(${hwnd})
`
  await promisify(execFile)(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')
    ],
    { windowsHide: true, timeout: 15000, maxBuffer: 4096 }
  )
}
