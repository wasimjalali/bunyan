import { dialog, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
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

/** True when the path exists, is readable and is a directory. */
export function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory()
  } catch {
    // Path does not exist or is not readable.
    return false
  }
}

/** Resolve a dropped path to a project. Returns null unless it is a directory. */
export function resolveProjectPath(target: string): OpenedProject | null {
  if (!isDirectory(target)) return null
  return { path: target, name: path.basename(target) }
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
