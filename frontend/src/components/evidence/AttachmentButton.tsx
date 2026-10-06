import { useRef } from 'react';
import { Paperclip } from 'lucide-react';
import type { LocalAttachment } from '../../types/domain';
import { Button, type ButtonSize, type ButtonVariant } from '../ui/Button';

/**
 * Local file selection. The browser never reads the file contents — only the name, size
 * and reported MIME type are captured so the demo can show attachment metadata.
 */
export function AttachmentButton({
  label = 'Attach local file',
  onSelect,
  pending = false,
  variant = 'secondary',
  size = 'sm',
}: {
  label?: string;
  onSelect: (attachment: Omit<LocalAttachment, 'attachedBy'>) => void;
  pending?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onSelect({
              filename: file.name,
              sizeBytes: file.size,
              mimeType: file.type || 'application/octet-stream',
              attachedAt: new Date().toISOString(),
            });
          }
          event.target.value = '';
        }}
      />
      <Button
        variant={variant}
        size={size}
        loading={pending}
        onClick={() => inputRef.current?.click()}
        icon={<Paperclip aria-hidden className="size-4" />}
      >
        {label}
      </Button>
    </>
  );
}
