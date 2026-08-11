"use client";

type Props = {
  officeId: string;
  officeName: string;
  envelopeCount: number;
  accountCount: number;
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
};

export default function DeleteOfficeButton({
  officeId,
  officeName,
  envelopeCount,
  accountCount,
  action,
  className,
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        const ok = window.confirm(
          `Delete office "${officeName}" permanently?\n\nThis removes ${accountCount} portal account(s) and ${envelopeCount} contract(s). This cannot be undone.`
        );
        if (!ok) event.preventDefault();
      }}
    >
      <input type="hidden" name="officeId" value={officeId} />
      <button type="submit" className={className}>
        Delete office
      </button>
    </form>
  );
}
