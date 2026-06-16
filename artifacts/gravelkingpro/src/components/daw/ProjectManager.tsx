import { useState, useEffect, useCallback } from "react";
import { FolderOpen, Save, Trash2, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  listProjects,
  saveProject,
  deleteProject,
  ProjectMeta,
  SavedProject,
} from "@/lib/daw/projectStorage";

interface Props {
  hasUnsavedTracks: boolean;
  onSave: (name: string) => Promise<SavedProject>;
  onLoad: (project: SavedProject) => Promise<void>;
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function ProjectManager({ hasUnsavedTracks, onSave, onLoad }: Props) {
  const { toast } = useToast();

  const [saveOpen,    setSaveOpen]    = useState(false);
  const [openOpen,    setOpenOpen]    = useState(false);
  const [projectName, setProjectName] = useState("");
  const [saving,      setSaving]      = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [projects,    setProjects]    = useState<ProjectMeta[]>([]);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [loadingId,   setLoadingId]   = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    setListLoading(true);
    try {
      setProjects(await listProjects());
    } catch {
      setProjects([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (openOpen) refreshList();
  }, [openOpen, refreshList]);

  const handleSave = async () => {
    const name = projectName.trim() || "Untitled Project";
    setSaving(true);
    try {
      const snapshot = await onSave(name);
      await saveProject(snapshot);
      toast({ title: "Project saved", description: `"${name}" saved to browser storage.` });
      setSaveOpen(false);
      setProjectName("");
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (meta: ProjectMeta) => {
    if (loadingId) return;
    setLoadingId(meta.id);
    try {
      const { loadProject } = await import("@/lib/daw/projectStorage");
      const project = await loadProject(meta.id);
      if (!project) throw new Error("Project not found");
      await onLoad(project);
      toast({ title: "Project loaded", description: `"${meta.name}" restored.` });
      setOpenOpen(false);
    } catch (e: any) {
      toast({ title: "Load failed", description: e.message, variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (meta: ProjectMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId) return;
    setDeletingId(meta.id);
    try {
      await deleteProject(meta.id);
      await refreshList();
      toast({ title: "Deleted", description: `"${meta.name}" removed.` });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <button
        onClick={() => { setOpenOpen(true); }}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded px-2.5 py-1 hover:border-zinc-500 transition-colors"
        title="Open saved project"
      >
        <FolderOpen className="w-3 h-3" /> Open
      </button>

      <button
        onClick={() => { setSaveOpen(true); setProjectName(""); }}
        disabled={!hasUnsavedTracks}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded px-2.5 py-1 hover:border-zinc-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title="Save current project"
      >
        <Save className="w-3 h-3" /> Save
      </button>

      {/* ── Save dialog ── */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Save Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <Input
              placeholder="Project name…"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
              className="bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-500"
              autoFocus
            />
            <p className="text-[11px] text-zinc-500">
              Saves all tracks, plugin chains, volume/pan, and BPM to your browser. Audio data is preserved as WAV so you can pick up exactly where you left off.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSaveOpen(false)} className="text-zinc-400">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1.5"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Open dialog ── */}
      <Dialog open={openOpen} onOpenChange={setOpenOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Open Project</DialogTitle>
          </DialogHeader>
          {listLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : projects.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-500">
              No saved projects yet. Save your current mix first.
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {projects.map(p => (
                <li
                  key={p.id}
                  onClick={() => handleLoad(p)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 cursor-pointer group transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-[11px] text-zinc-500">
                      {p.trackCount} track{p.trackCount !== 1 ? "s" : ""} · {fmt(p.savedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {loadingId === p.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    ) : (
                      <FolderOpen className="w-3.5 h-3.5 text-zinc-500 group-hover:text-amber-400 transition-colors" />
                    )}
                    <button
                      onClick={e => handleDelete(p, e)}
                      disabled={deletingId === p.id || loadingId !== null}
                      className="p-1 rounded hover:bg-zinc-600 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-30"
                      title="Delete project"
                    >
                      {deletingId === p.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Trash2 className="w-3 h-3" />
                      }
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
