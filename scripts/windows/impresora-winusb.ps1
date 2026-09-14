<#
  Impresora de recibos USB para el kiosco en un PC con Windows.

  Se corre UNA vez por PC de kiosco, con la impresora conectada. Hace dos cosas:

  1. Windows toma las impresoras USB con su controlador de impresion (usbprint) y asi
     Chrome/Edge no las pueden abrir por WebUSB. Les pone el controlador "WinUsb Device"
     que ya trae Windows (no se descarga nada).
  2. Autoriza esas impresoras para la web del kiosco en Chrome y Edge (politica
     WebUsbAllowDevicesForUrls). Asi no hay que entrar a /impresora a conectarla: al
     reabrir el navegador el kiosco la detecta sola. Se comprueba en chrome://policy.

  Uso (clic derecho -> Ejecutar con PowerShell, o desde una consola):
    powershell -ExecutionPolicy Bypass -File impresora-winusb.ps1                     # preparar
    powershell -ExecutionPolicy Bypass -File impresora-winusb.ps1 -Url https://otro.dominio
    powershell -ExecutionPolicy Bypass -File impresora-winusb.ps1 -Revertir           # deshacer

  Pide permiso de administrador. Solo toca impresoras USB (clase 07) conectadas.
  Con WinUSB la impresora deja de verse como impresora de Windows: solo la usa la web.
#>
param([switch]$Revertir, [string]$Url = 'https://parking.quiklygo.com')

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Url `"$Url`""
  if ($Revertir) { $argumentos += ' -Revertir' }
  Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList $argumentos
  exit
}

$claseUsb = '{36FC9E60-C465-11CF-8056-444553540000}'
$claseUsbDevice = '{88BAE032-5A81-49F0-BC3D-A4FF138216D6}'

function Get-ImpresorasUsb {
  Get-PnpDevice -PresentOnly | Where-Object {
    $_.InstanceId -like 'USB\VID_*' -and
    ((Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName DEVPKEY_Device_CompatibleIds -ErrorAction SilentlyContinue).Data -match '^USB\\Class_07')
  }
}

function Get-Servicio($id) {
  (Get-PnpDeviceProperty -InstanceId $id -KeyName DEVPKEY_Device_Service -ErrorAction SilentlyContinue).Data
}

$politicas = @('HKLM:\SOFTWARE\Policies\Google\Chrome', 'HKLM:\SOFTWARE\Policies\Microsoft\Edge')
$origen = ([Uri]$Url).GetLeftPart([UriPartial]::Authority)

# Entradas de WebUsbAllowDevicesForUrls que no son de este origen: se conservan.
function Get-PermisosAjenos($ruta) {
  $lista = New-Object System.Collections.ArrayList
  $previo = (Get-ItemProperty -Path $ruta -Name WebUsbAllowDevicesForUrls -ErrorAction SilentlyContinue).WebUsbAllowDevicesForUrls
  if ($previo) {
    try {
      foreach ($entrada in @($previo | ConvertFrom-Json)) {
        if (@($entrada.urls) -notcontains $origen) { [void]$lista.Add($entrada) }
      }
    } catch { }
  }
  return ,$lista
}

function Set-PermisoWebUsb($impresoras) {
  $dispositivos = @(foreach ($d in $impresoras) {
    if ($d.InstanceId -match 'VID_([0-9A-F]{4})&PID_([0-9A-F]{4})') {
      [pscustomobject]@{ vendor_id = [Convert]::ToInt32($Matches[1], 16); product_id = [Convert]::ToInt32($Matches[2], 16) }
    }
  })
  if ($dispositivos.Count -eq 0) { return }
  foreach ($ruta in $politicas) {
    if (-not (Test-Path $ruta)) { New-Item -Path $ruta -Force | Out-Null }
    $lista = Get-PermisosAjenos $ruta
    [void]$lista.Add([pscustomobject]@{ devices = $dispositivos; urls = @($origen) })
    $json = ConvertTo-Json -InputObject $lista.ToArray() -Depth 5 -Compress
    Set-ItemProperty -Path $ruta -Name WebUsbAllowDevicesForUrls -Value $json -Type String
  }
  Write-Host "Chrome y Edge: impresora autorizada para $origen (reabre el navegador)."
}

function Remove-PermisoWebUsb {
  foreach ($ruta in $politicas) {
    if (-not (Test-Path $ruta)) { continue }
    $lista = Get-PermisosAjenos $ruta
    if ($lista.Count -eq 0) {
      Remove-ItemProperty -Path $ruta -Name WebUsbAllowDevicesForUrls -ErrorAction SilentlyContinue
    } else {
      Set-ItemProperty -Path $ruta -Name WebUsbAllowDevicesForUrls -Value (ConvertTo-Json -InputObject $lista.ToArray() -Depth 5 -Compress) -Type String
    }
  }
  Write-Host "Chrome y Edge: permiso de impresora para $origen retirado."
}

if ($Revertir) {
  Remove-PermisoWebUsb
  foreach ($d in Get-ImpresorasUsb | Where-Object { (Get-Servicio $_.InstanceId) -eq 'WINUSB' }) {
    Write-Host "Devolviendo $($d.FriendlyName) al controlador de Windows..."
    pnputil /remove-device "$($d.InstanceId)" | Out-Null
  }
  pnputil /scan-devices | Out-Null
  Get-ImpresorasUsb | ForEach-Object { Write-Host "$($_.FriendlyName): $(Get-Servicio $_.InstanceId)" }
  Read-Host 'Listo. Enter para cerrar'
  exit
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class WinUsbKiosco {
  [StructLayout(LayoutKind.Sequential)]
  public struct SP_DEVINFO_DATA { public int cbSize; public Guid ClassGuid; public int DevInst; public IntPtr Reserved; }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct SP_DEVINSTALL_PARAMS {
    public int cbSize; public int Flags; public int FlagsEx; public IntPtr hwndParent;
    public IntPtr InstallMsgHandler; public IntPtr InstallMsgHandlerContext; public IntPtr FileQueue;
    public UIntPtr ClassInstallReserved; public int Reserved;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string DriverPath;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct SP_DRVINFO_DATA {
    public int cbSize; public int DriverType; public UIntPtr Reserved;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string Description;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string MfgName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string ProviderName;
    public uint DateLow; public uint DateHigh; public ulong DriverVersion;
  }

  [DllImport("setupapi.dll", SetLastError = true)] static extern IntPtr SetupDiCreateDeviceInfoList(ref Guid cls, IntPtr hwnd);
  [DllImport("setupapi.dll", SetLastError = true, EntryPoint = "SetupDiCreateDeviceInfoList")] static extern IntPtr SetupDiCreateDeviceInfoListNoClass(IntPtr cls, IntPtr hwnd);
  [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool SetupDiOpenDeviceInfoW(IntPtr set, string id, IntPtr hwnd, int flags, ref SP_DEVINFO_DATA did);
  [DllImport("setupapi.dll", SetLastError = true)] static extern bool SetupDiSetDeviceRegistryPropertyW(IntPtr set, ref SP_DEVINFO_DATA did, int prop, byte[] buf, int size);
  [DllImport("setupapi.dll", SetLastError = true)] static extern bool SetupDiGetDeviceInstallParamsW(IntPtr set, ref SP_DEVINFO_DATA did, ref SP_DEVINSTALL_PARAMS p);
  [DllImport("setupapi.dll", SetLastError = true)] static extern bool SetupDiSetDeviceInstallParamsW(IntPtr set, ref SP_DEVINFO_DATA did, ref SP_DEVINSTALL_PARAMS p);
  [DllImport("setupapi.dll", SetLastError = true)] static extern bool SetupDiBuildDriverInfoList(IntPtr set, ref SP_DEVINFO_DATA did, int type);
  [DllImport("setupapi.dll", SetLastError = true)] static extern bool SetupDiEnumDriverInfoW(IntPtr set, ref SP_DEVINFO_DATA did, int type, int index, ref SP_DRVINFO_DATA drv);
  [DllImport("setupapi.dll", SetLastError = true)] static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
  [DllImport("newdev.dll", SetLastError = true)] static extern bool DiInstallDevice(IntPtr hwnd, IntPtr set, ref SP_DEVINFO_DATA did, ref SP_DRVINFO_DATA drv, int flags, out bool reboot);

  static void Ok(bool r, string paso) { if (!r) throw new Exception(paso + ": error " + Marshal.GetLastWin32Error()); }

  // SPDRP_CLASSGUID. La lista de controladores se arma por clase y WinUSB es de la clase USBDevice.
  public static void CambiarClase(string id, string clase) {
    IntPtr set = SetupDiCreateDeviceInfoListNoClass(IntPtr.Zero, IntPtr.Zero);
    try {
      var did = new SP_DEVINFO_DATA(); did.cbSize = Marshal.SizeOf(did);
      Ok(SetupDiOpenDeviceInfoW(set, id, IntPtr.Zero, 0, ref did), "abrir el dispositivo");
      byte[] buf = System.Text.Encoding.Unicode.GetBytes(clase + "\0");
      Ok(SetupDiSetDeviceRegistryPropertyW(set, ref did, 8, buf, buf.Length), "cambiar la clase");
    } finally { SetupDiDestroyDeviceInfoList(set); }
  }

  public static string InstalarWinUsb(string id, Guid claseUsbDevice) {
    IntPtr set = SetupDiCreateDeviceInfoList(ref claseUsbDevice, IntPtr.Zero);
    try {
      var did = new SP_DEVINFO_DATA(); did.cbSize = Marshal.SizeOf(did);
      Ok(SetupDiOpenDeviceInfoW(set, id, IntPtr.Zero, 0, ref did), "abrir el dispositivo");

      var p = new SP_DEVINSTALL_PARAMS(); p.cbSize = Marshal.SizeOf(p);
      Ok(SetupDiGetDeviceInstallParamsW(set, ref did, ref p), "leer parametros");
      p.Flags |= 0x00010000;   // DI_ENUMSINGLEINF: solo winusb.inf
      p.FlagsEx |= 0x00000800; // DI_FLAGSEX_ALLOWEXCLUDEDDRVS
      p.DriverPath = Environment.ExpandEnvironmentVariables(@"%SystemRoot%\INF\winusb.inf");
      Ok(SetupDiSetDeviceInstallParamsW(set, ref did, ref p), "elegir winusb.inf");
      Ok(SetupDiBuildDriverInfoList(set, ref did, 1), "listar controladores");

      for (int i = 0; ; i++) {
        var drv = new SP_DRVINFO_DATA(); drv.cbSize = Marshal.SizeOf(drv);
        if (!SetupDiEnumDriverInfoW(set, ref did, 1, i, ref drv)) break;
        // "WinUsb Device" en ingles, "Dispositivo WinUsb" en espanol. ADB y Billboard son otros.
        if (drv.Description.IndexOf("winusb", StringComparison.OrdinalIgnoreCase) >= 0 &&
            drv.Description.IndexOf("adb", StringComparison.OrdinalIgnoreCase) < 0) {
          bool reboot;
          Ok(DiInstallDevice(IntPtr.Zero, set, ref did, ref drv, 0, out reboot), "instalar WinUSB");
          return drv.Description;
        }
      }
      throw new Exception("Windows no ofrecio el controlador WinUSB");
    } finally { SetupDiDestroyDeviceInfoList(set); }
  }
}
'@

$impresoras = @(Get-ImpresorasUsb)
if ($impresoras.Count -eq 0) {
  Write-Host 'No hay impresoras USB conectadas. Conectala, enciendela y vuelve a correr el script.'
}
foreach ($d in $impresoras) {
  $id = $d.InstanceId
  if ((Get-Servicio $id) -eq 'WINUSB') { Write-Host "$($d.FriendlyName): ya usa WinUSB."; continue }
  try {
    [WinUsbKiosco]::CambiarClase($id, $claseUsbDevice)
    $nombre = [WinUsbKiosco]::InstalarWinUsb($id, [Guid]$claseUsbDevice)
    Write-Host "$($d.FriendlyName): listo, ahora usa '$nombre'."
  } catch {
    Write-Host "$($d.FriendlyName): no se pudo ($($_.Exception.Message))."
    if ((Get-Servicio $id) -ne 'WINUSB') { [WinUsbKiosco]::CambiarClase($id, $claseUsb) }
  }
}
Set-PermisoWebUsb @(Get-ImpresorasUsb | Where-Object { (Get-Servicio $_.InstanceId) -eq 'WINUSB' })
Write-Host ''
Write-Host "Listo. Cierra y vuelve a abrir Chrome o Edge en $origen/p/<sitio>/pos: la impresora se usa sola."
Write-Host "Para probarla: $origen/p/<sitio>/pos/impresora -> Imprimir prueba."
Read-Host 'Enter para cerrar'
