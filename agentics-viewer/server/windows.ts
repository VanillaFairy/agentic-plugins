import { spawn } from 'node:child_process'

const APP_ID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function forPowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

export function toastScript(title: string, body: string): string {
  const safeTitle = forPowerShellSingleQuoted(xmlEscape(title))
  const safeBody = forPowerShellSingleQuoted(xmlEscape(body))
  return `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>${safeTitle}</text><text>${safeBody}</text></binding></visual></toast>')
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$appId = '${APP_ID}'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
`
}

export function folderDialogScript(): string {
  return `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = 'Choose a project folder'
$d.ShowNewFolderButton = $false
if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.SelectedPath) } else { [Console]::Out.Write('::cancelled::') }
`
}

export type FolderPick = { path: string } | { cancelled: true } | { error: string }

export function parsePick(code: number | null, stdout: string, stderr: string): FolderPick {
  const out = stdout.trim()
  if (code === 0 && out === '::cancelled::') {
    return { cancelled: true }
  }
  if (code === 0 && out !== '') {
    return { path: out }
  }
  const err = stderr.trim()
  return { error: err !== '' ? err : `powershell exited ${code}` }
}

function runPowerShell(exe: string, args: string[], script: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(exe, args, { windowsHide: true })
    } catch (error) {
      reject(error)
      return
    }
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      reject(error)
    })
    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
    child.stdin?.write(script)
    child.stdin?.end()
  })
}

export function showToast(title: string, body: string, opts?: { exe?: string }): Promise<void> {
  const exe = opts?.exe ?? 'powershell.exe'
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-']
  return runPowerShell(exe, args, toastScript(title, body))
    .then(() => undefined)
    .catch((error: unknown) => {
      console.error('showToast failed', error)
      return undefined
    })
}

export function pickFolder(opts?: { exe?: string }): Promise<FolderPick> {
  const exe = opts?.exe ?? 'powershell.exe'
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-Command', '-']
  return runPowerShell(exe, args, folderDialogScript()).then(({ code, stdout, stderr }) => parsePick(code, stdout, stderr))
}
