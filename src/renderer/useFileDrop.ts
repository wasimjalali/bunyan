import { useState } from 'react'

interface FileDropHandlers {
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

/**
 * Shared drop-target behaviour for files dragged in from Finder: drag-type
 * detection, the drag-over affordance flag, the child-crossing leave guard
 * and File -> path resolution (Electron webUtils via the preload bridge).
 *
 * Files from Finder carry the 'Files' type; the rail's internal row reorders
 * do not, so this alone distinguishes them and reorders pass through untouched.
 */
export function useFileDrop(onFiles: (paths: string[]) => void): {
  fileOver: boolean
  dropHandlers: FileDropHandlers
} {
  const [fileOver, setFileOver] = useState(false)
  const isFileDrag = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('Files')

  return {
    fileOver,
    dropHandlers: {
      onDragOver: (e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        if (!fileOver) setFileOver(true)
      },
      onDragLeave: (e) => {
        // Ignore leave events fired when crossing into a child element.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false)
      },
      onDrop: (e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        setFileOver(false)
        const paths = Array.from(e.dataTransfer.files)
          .map((f) => window.bunyan.app.pathForFile(f))
          .filter((p) => p !== '')
        if (paths.length > 0) onFiles(paths)
      },
    },
  }
}
