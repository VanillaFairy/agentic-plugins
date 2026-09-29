# Toast and folder dialog through powershell.exe

Status: **proven on this machine, 2026-09-27.** Both scripts below work exactly as written — no
change to the toast XML, the AppUserModelID, or the dialog script was needed.

The toast is silent (script exits 0, nothing shown, not even in the action center) when Windows
notifications are off system-wide (Settings > System > Notifications, or Focus Assist/Do Not
Disturb). That's a system setting, not a script bug: `ToastNotificationManager` doesn't report
the failure. The viewer can't detect or fix this; `showToast` never rejects either way (§4.6 of
the spec already treats a toast failure as silent).

Both scripts run under Windows PowerShell 5.1 (`powershell.exe`), not PowerShell 7 (`pwsh`):
only 5.1 can load WinRT types with `ContentType = WindowsRuntime`. Spawn it from Node with the
script on stdin:

```ts
spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true })
// the folder dialog adds '-STA' before '-Command'
```

## Toast

```powershell
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>TITLE</text><text>BODY</text></binding></visual></toast>')
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
```

`TITLE` and `BODY` are XML-escaped (`&amp; &lt; &gt; &quot; &apos;`), and then every `'` is
doubled, because the XML sits inside a single-quoted PowerShell string.

## Folder dialog

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = 'Choose a project folder'
$d.ShowNewFolderButton = $false
if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) } else { [Console]::Out.Write('::cancelled::') }
```

stdout is the chosen path, or `::cancelled::`. A non-zero exit or stderr output is an error.
