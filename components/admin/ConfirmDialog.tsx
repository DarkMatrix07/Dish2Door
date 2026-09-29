"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export type ConfirmOptions = {
  title: string;
  description?: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

// The admin's one confirmation popup, in place of window.confirm. Usage:
//   const [confirm, confirmDialog] = useConfirm();
//   if (!(await confirm({ title: "Delete X?", destructive: true, confirmLabel: "Delete" }))) return;
//   ...and render {confirmDialog} once in the component.
export function useConfirm(): [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    // A second request while one is open answers the first with "no".
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const cancel = useCallback(() => settle(false), [settle]);

  const dialog = (
    <Modal
      open={options !== null}
      onClose={cancel}
      title={options?.title ?? ""}
      description={options?.description}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={cancel}>{options?.cancelLabel ?? "Keep it"}</Button>
          <Button variant={options?.destructive ? "destructive" : "default"} size="sm" onClick={() => settle(true)}>
            {options?.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    >
      {options?.body ?? <p className="text-sm text-neutral-600">{options?.destructive ? "This cannot be undone." : "Please confirm to continue."}</p>}
    </Modal>
  );

  return [confirm, dialog];
}
