import { toast } from "sonner";
import { ACCEPTED_TYPES, ACCEPTED_EXTENSIONS, getFileExtension } from "@/lib/utils";

export interface DroppedFile {
  file: File;
  relativePath: string;
}

export function getBasename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function getDirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

export function replaceExtension(path: string, ext: string): string {
  return `${path.replace(/\.[^.]+$/, "")}${ext}`;
}

function getRelativePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function traverseEntry(
  entry: FileSystemEntry,
  basePath: string,
  out: DroppedFile[]
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    return new Promise((resolve) => {
      fileEntry.file(
        (file) => {
          out.push({ file, relativePath: `${basePath}${entry.name}` });
          resolve();
        },
        () => resolve()
      );
    });
  }

  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const childBase = `${basePath}${entry.name}/`;
    return new Promise((resolve) => {
      const readBatch = () => {
        reader.readEntries(
          async (entries) => {
            if (entries.length === 0) {
              resolve();
              return;
            }
            await Promise.all(entries.map((child) => traverseEntry(child, childBase, out)));
            readBatch();
          },
          () => resolve()
        );
      };
      readBatch();
    });
  }

  return Promise.resolve();
}

export async function extractDroppedFiles(
  dataTransfer: DataTransfer | null
): Promise<DroppedFile[]> {
  if (!dataTransfer) return [];

  const items = Array.from(dataTransfer.items || []);
  const entries = items
    .map((item) => {
      const getter = (
        item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }
      ).webkitGetAsEntry;
      return getter ? getter.call(item) : null;
    })
    .filter((entry): entry is FileSystemEntry => entry !== null);

  if (entries.length > 0) {
    const out: DroppedFile[] = [];
    for (const entry of entries) {
      await traverseEntry(entry, "", out);
    }
    return out;
  }

  return Array.from(dataTransfer.files || []).map((file) => ({
    file,
    relativePath: getRelativePath(file),
  }));
}

export function filterSupportedFiles(dropped: DroppedFile[]): DroppedFile[] {
  const acceptedExts = ACCEPTED_EXTENSIONS.split(",").map((e) => e.replace(".", ""));
  const valid: DroppedFile[] = [];

  for (const d of dropped) {
    const ext = getFileExtension(d.file.name);
    const isTypeValid = ACCEPTED_TYPES.includes(d.file.type);
    const isExtValid = ext ? acceptedExts.includes(ext) : false;
    if (!isTypeValid && !isExtValid) {
      toast.error(`"${d.file.name}" is not a supported format. Use JPEG, PNG, WebP, or AVIF.`);
      continue;
    }
    valid.push(d);
  }

  return valid;
}