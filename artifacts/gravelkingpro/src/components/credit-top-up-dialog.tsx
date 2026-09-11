import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface CreditTopUpRequest {
  format: "MP3" | "WAV";
  required: number;
  balance: number;
}

export function CreditTopUpDialog({
  request,
  onOpenChange,
}: {
  request: CreditTopUpRequest | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={onOpenChange}>
      <DialogContent data-testid="credit-top-up-dialog">
        <DialogHeader>
          <DialogTitle>More credits needed</DialogTitle>
          <DialogDescription>
            {request
              ? `Download ${request.format} requires ${request.required} credits. Your current balance is ${request.balance}.`
              : "Add credits to continue."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Link href="/pricing#credits">
            <Button onClick={() => onOpenChange(false)}>Top up credits</Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}