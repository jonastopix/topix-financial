import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  secondsLeft: number;
  onExtend: () => void;
}

export function InactivityWarningDialog({ open, secondsLeft, onExtend }: Props) {
  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timeStr = minutes > 0
    ? `${minutes}:${secs.toString().padStart(2, "0")}`
    : `${secs}s`;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Din session udløber snart</AlertDialogTitle>
          <AlertDialogDescription>
            Du har været inaktiv i et stykke tid. Du bliver automatisk logget ud om{" "}
            <span className="font-semibold text-foreground">{timeStr}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onExtend}>
            Forlæng session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
