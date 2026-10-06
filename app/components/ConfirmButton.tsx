import { useEffect, useState } from "react";

import { Button } from "./Button";

// Asks for a second tap before doing something that can't be undone. The ask
// stands for a few seconds, then quietly resets.
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  variant = "quiet",
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  variant?: "primary" | "secondary" | "quiet";
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      label={armed ? confirmLabel : label}
      variant={variant}
      disabled={disabled}
      onPress={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    />
  );
}
