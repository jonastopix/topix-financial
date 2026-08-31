import React, { useState } from "react";
import { Pencil, Trash2, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isMine: boolean;
  /** variant="hb" (C4): Hjemmebane-udtrykket. Dropdown- og alert-
      indholdet er PORTALER uden for .theme-hjemmebane-wrapperen —
      klassen sættes derfor på Content-elementerne selv. Slet er rust
      (advarsel/destruktiv, rusts etablerede betydninger). Uden variant
      er alt tegn-for-tegn som før. */
  variant?: "hb";
}

const MessageActionMenu: React.FC<Props> = ({ canEdit, canDelete, onEdit, onDelete, isMine, variant }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hb = variant === "hb";

  if (!canEdit && !canDelete) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={
              hb
                ? "p-1 rounded-md transition-all text-hb-ink-soft opacity-0 group-hover/msg:opacity-100 hover:text-hb-ink hover:bg-hb-sage/30"
                : "p-1 rounded-md transition-all text-muted-foreground opacity-0 group-hover/msg:opacity-100 hover:text-foreground hover:bg-secondary"
            }
            title="Besked-handlinger"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={isMine ? "end" : "start"}
          sideOffset={4}
          className={hb ? "theme-hjemmebane border-hb-line bg-hb-surface text-hb-ink" : undefined}
        >
          {canEdit && (
            <DropdownMenuItem onClick={onEdit} className={`gap-2 text-xs${hb ? " focus:bg-hb-sage/30 focus:text-hb-ink" : ""}`}>
              <Pencil className="h-3.5 w-3.5" />
              Redigér
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              onClick={() => setConfirmDelete(true)}
              className={
                hb
                  ? "gap-2 text-xs text-hb-rust focus:text-hb-rust focus:bg-hb-rust/10"
                  : "gap-2 text-xs text-destructive focus:text-destructive"
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
              Slet
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className={hb ? "theme-hjemmebane border-hb-line bg-hb-surface" : undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle className={hb ? "text-hb-ink" : undefined}>Slet besked?</AlertDialogTitle>
            <AlertDialogDescription className={hb ? "text-hb-ink-soft" : undefined}>
              Beskeden fjernes permanent for alle i samtalen. Denne handling kan ikke fortrydes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={hb ? "rounded-full border-hb-ink/25 text-hb-ink hover:bg-hb-sage/50 hover:text-hb-ink" : undefined}>
              Annuller
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className={
                hb
                  ? "rounded-full bg-hb-rust text-white hover:bg-hb-rust/90"
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }
            >
              Slet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MessageActionMenu;
