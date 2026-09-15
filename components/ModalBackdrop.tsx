"use client";

/**
 * Standard modal wrapper: clicking the dimmed backdrop closes the modal
 * (same as Cancel/Back), while clicks inside the modal box itself don't
 * propagate up and trigger that close.
 */
export default function ModalBackdrop({
  onClose,
  children,
  maxWidth = "max-w-lg",
  className = "",
  zIndex = "z-10",
}: {
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
  zIndex?: string;
}) {
  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-black/30 p-4`}
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} rounded-xl bg-white p-6 shadow-lg ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
