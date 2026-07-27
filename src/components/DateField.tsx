import * as React from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

function isoToDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DateField({
  value,
  onChange,
  placeholder = "בחר תאריך",
  min,
  max,
  className,
  allowClear = true,
  size = "md",
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: string | null;
  max?: string | null;
  className?: string;
  allowClear?: boolean;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = React.useState(false);
  const date = isoToDate(value);
  const minDate = isoToDate(min);
  const maxDate = isoToDate(max);
  const label = date ? format(date, "d בMMM yyyy", { locale: he }) : placeholder;
  const h = size === "sm" ? "h-10" : "h-11";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full rounded-lg bg-background border border-input px-3 flex items-center justify-between gap-2 text-right outline-none focus:border-[color:var(--accent)]",
            h,
            !date && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2 min-w-0 truncate">
            <CalendarIcon className="w-4 h-4 opacity-70 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
          {allowClear && date && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="נקה"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onChange("");
              }}
              className="opacity-60 hover:opacity-100 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 z-[1200] pointer-events-auto"
        align="start"
      >
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              onChange(dateToIso(d));
              setOpen(false);
            }
          }}
          initialFocus
          disabled={(d) => {
            if (minDate && d < minDate) return true;
            if (maxDate && d > maxDate) return true;
            return false;
          }}
          defaultMonth={date ?? minDate ?? maxDate ?? undefined}
          locale={he}
          dir="rtl"
          captionLayout="dropdown"
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
