import { dialog, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import path from 'node:path'
import type { OpenedProject, GitBranchResult } from '@shared/ipc'

/** Opens the macOS folder picker. Returns the chosen folder, or null if cancelled. */
export async function openProjectDialog(parent: BrowserWindow): Promise<OpenedProject | null> {
  const result = await dialog.showOpenDialog(parent, {
    title: 'Open project',
    buttonLabel: 'Open',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const dir = result.filePaths[0]!
  return { path: dir, name: path.basename(dir) }
}

/**
 * Reads the current git branch for a folder. Returns null when the folder is not
 * a git repo. Uses execFile (no shell) so the path can never be interpreted as a
 * command. Detached HEAD reports as "HEAD".
 */
export function readGitBranch(repoPath: string): Promise<GitBranchResult | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: repoPath, timeout: 2000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve(null)
          return
        }
        const branch = stdout.trim()
        resolve(branch ? { branch } : null)
      },
    )
  })
}
