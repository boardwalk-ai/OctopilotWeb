"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthService } from "@/services/AuthService";

type EventSlotRow = {
  id: string;
  event_date: string;
  timezone: string;
  starts_at?: string | null;
  ends_at?: string | null;
  slot_label: string;
  start_time_label?: string | null;
  end_time_label?: string | null;
  is_active: boolean;
  is_booked: boolean;
  booked_by?: string | null;
  booking_id?: string | null;
};

type BookingRow = {
  id: string;
  status: string;
  booked_email: string;
  created_at?: string | null;
  review_rating?: number | null;
  review_text?: string | null;
  slot: EventSlotRow;
};

type OverviewPayload = {
  slots: EventSlotRow[];
  bookings: BookingRow[];
  available_date_overrides: string[];
  counts: {
    slots: number;
    active_slots: number;
    booked: number;
  };
};

type SlotMutationResponse = {
  message: string;
  slot: EventSlotRow;
};

type EarlyAccessEventsPanelProps = {
  refreshKey: number;
};

const DEFAULT_SLOT_TIMEZONE = "America/New_York";
const EARLY_ACCESS_WINDOW_START = new Date(2026, 3, 1);
const EARLY_ACCESS_WINDOW_END = new Date(2026, 4, 14);
const EARLY_ACCESS_WINDOW_START_KEY = toDateKey(EARLY_ACCESS_WINDOW_START);
const EARLY_ACCESS_WINDOW_END_KEY = toDateKey(EARLY_ACCESS_WINDOW_END);
const EARLY_ACCESS_BLOCKED_DATE_KEYS = new Set([
  "2026-04-06",
  "2026-04-07",
  "2026-04-08",
  "2026-04-09",
  "2026-04-15",
  "2026-04-16",
  "2026-04-17",
  "2026-04-22",
]);
const THURSDAY_INDEX = 4;
const EARLY_ACCESS_WINDOW_LABEL = "April 1, 2026 to May 14, 2026";

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function buildCalendarDays(month: Date) {
  const firstDay = startOfMonth(month);
  const offset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - offset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      key: toDateKey(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month.getMonth(),
    };
  });
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(parseDateKey(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function isDateWithinEarlyAccessWindow(dateKey: string) {
  return dateKey >= EARLY_ACCESS_WINDOW_START_KEY && dateKey <= EARLY_ACCESS_WINDOW_END_KEY;
}

function getEarlyAccessBaseDateRestriction(dateKey: string) {
  if (!isDateWithinEarlyAccessWindow(dateKey)) {
    return null;
  }

  if (EARLY_ACCESS_BLOCKED_DATE_KEYS.has(dateKey)) {
    return "This date is marked unavailable.";
  }

  if (parseDateKey(dateKey).getDay() === THURSDAY_INDEX) {
    return "Every Thursday is unavailable.";
  }

  return null;
}

function isEarlyAccessUnavailableDate(dateKey: string, availableDateOverrideSet: Set<string>) {
  if (!isDateWithinEarlyAccessWindow(dateKey)) {
    return false;
  }

  if (availableDateOverrideSet.has(dateKey)) {
    return false;
  }

  return Boolean(getEarlyAccessBaseDateRestriction(dateKey));
}

function getEarlyAccessDateRestriction(dateKey: string, availableDateOverrideSet: Set<string>) {
  if (!isDateWithinEarlyAccessWindow(dateKey)) {
    return `Slots can only be added from ${EARLY_ACCESS_WINDOW_LABEL}.`;
  }

  if (availableDateOverrideSet.has(dateKey)) {
    return null;
  }

  return getEarlyAccessBaseDateRestriction(dateKey);
}

function normalizeTimezoneValue(value?: string | null) {
  const rawValue = `${value || ""}`.trim();
  if (!rawValue) return DEFAULT_SLOT_TIMEZONE;

  const offsetMatch = rawValue.match(/^(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (offsetMatch) {
    const sign = offsetMatch[1];
    const hours = offsetMatch[2].padStart(2, "0");
    const minutes = (offsetMatch[3] || "00").padStart(2, "0");
    return `UTC${sign}${hours}:${minutes}`;
  }

  return rawValue;
}

function getDefaultSlotTimezone() {
  return DEFAULT_SLOT_TIMEZONE;
}

function normalizeTimeInputValue(value?: string | null) {
  const rawValue = `${value || ""}`.trim();
  if (!rawValue) return "09:00";

  const match24Hour = rawValue.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24Hour) {
    const hour = Number(match24Hour[1]);
    const minute = Number(match24Hour[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const match12Hour = rawValue.match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (match12Hour) {
    const rawHour = Number(match12Hour[1]);
    const minute = Number(match12Hour[2] || "0");
    const meridiem = match12Hour[3].toUpperCase();
    if (rawHour >= 1 && rawHour <= 12 && minute >= 0 && minute <= 59) {
      let hour = rawHour % 12;
      if (meridiem === "PM") {
        hour += 12;
      }
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  return rawValue;
}

function getTimeInputValue(isoValue?: string | null, timezone = "UTC") {
  if (!isoValue) return "09:00";
  const date = new Date(isoValue);
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value || "09";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  return `${hour}:${minute}`;
}

function getDurationMinutes(slot: EventSlotRow) {
  if (!slot.starts_at || !slot.ends_at) return 30;
  const start = new Date(slot.starts_at).getTime();
  const end = new Date(slot.ends_at).getTime();
  const diffMinutes = Math.round((end - start) / 60000);
  return diffMinutes > 0 ? diffMinutes : 30;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const performFetch = async (forceRefresh: boolean) => {
    const token = await AuthService.getIdToken(forceRefresh);
    if (!token) {
      throw new Error("You need to be signed in as an admin.");
    }

    return fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
    });
  };

  let response = await performFetch(false);
  if (response.status === 401) {
    response = await performFetch(true);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload.detail === "string"
        ? payload.detail
        : payload.detail?.message || payload.error || "Admin request failed.";
    throw new Error(message);
  }

  return payload as T;
}

function SectionFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[26px] border border-white/8 bg-[#101010]">
      <div className="border-b border-white/8 px-5 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/35">{title}</div>
        <div className="mt-2 text-sm leading-6 text-white/46">{description}</div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function EarlyAccessEventsPanel({ refreshKey }: EarlyAccessEventsPanelProps) {
  const saveSlotLockRef = useRef(false);
  const [slots, setSlots] = useState<EventSlotRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [availableDateOverrides, setAvailableDateOverrides] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(EARLY_ACCESS_WINDOW_START_KEY);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(EARLY_ACCESS_WINDOW_START));
  const [slotTime, setSlotTime] = useState("09:00");
  const [slotDuration, setSlotDuration] = useState(30);
  const [slotLabel, setSlotLabel] = useState("");
  const [slotTimezone, setSlotTimezone] = useState(DEFAULT_SLOT_TIMEZONE);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingDateAvailability, setIsTogglingDateAvailability] = useState(false);
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const availableDateOverrideSet = useMemo(() => new Set(availableDateOverrides), [availableDateOverrides]);
  const availableDateSet = useMemo(() => new Set(slots.filter((slot) => slot.is_active && !slot.is_booked).map((slot) => slot.event_date)), [slots]);
  const filledDateSet = useMemo(() => new Set(slots.filter((slot) => slot.is_active && slot.is_booked).map((slot) => slot.event_date)), [slots]);
  const selectedDateSlots = useMemo(
    () =>
      slots
        .filter((slot) => slot.event_date === selectedDate)
        .sort((left, right) => new Date(left.starts_at || "").getTime() - new Date(right.starts_at || "").getTime()),
    [slots, selectedDate]
  );
  const selectedDateBaseRestriction = useMemo(() => getEarlyAccessBaseDateRestriction(selectedDate), [selectedDate]);
  const selectedDateHasManualAvailability = useMemo(() => availableDateOverrideSet.has(selectedDate), [availableDateOverrideSet, selectedDate]);
  const selectedDateCanToggleAvailability = useMemo(
    () => isDateWithinEarlyAccessWindow(selectedDate) && Boolean(selectedDateBaseRestriction),
    [selectedDate, selectedDateBaseRestriction]
  );
  const selectedDateRestriction = useMemo(
    () => getEarlyAccessDateRestriction(selectedDate, availableDateOverrideSet),
    [selectedDate, availableDateOverrideSet]
  );
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(visibleMonth),
    [visibleMonth]
  );
  const canGoToPreviousMonth = visibleMonth.getTime() > startOfMonth(EARLY_ACCESS_WINDOW_START).getTime();
  const canGoToNextMonth = visibleMonth.getTime() < startOfMonth(EARLY_ACCESS_WINDOW_END).getTime();

  const load = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      const payload = await adminFetch<OverviewPayload>("/backend/api/v1/appointments/admin/early-access/overview");
      setSlots(payload.slots || []);
      setBookings(payload.bookings || []);
      setAvailableDateOverrides(payload.available_date_overrides || []);
      setSelectedDate((current) => (isDateWithinEarlyAccessWindow(current) ? current : EARLY_ACCESS_WINDOW_START_KEY));
      setVisibleMonth((current) => {
        const monthStart = startOfMonth(current);
        if (monthStart.getTime() < startOfMonth(EARLY_ACCESS_WINDOW_START).getTime()) {
          return startOfMonth(EARLY_ACCESS_WINDOW_START);
        }
        if (monthStart.getTime() > startOfMonth(EARLY_ACCESS_WINDOW_END).getTime()) {
          return startOfMonth(EARLY_ACCESS_WINDOW_END);
        }
        return monthStart;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load early-access events.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  useEffect(() => {
    setSlotTimezone(getDefaultSlotTimezone());
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        void load();
      }
    };

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        void load();
      }
    }, 15000);

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  const resetForm = () => {
    setEditingSlotId(null);
    setSlotTime("09:00");
    setSlotDuration(30);
    setSlotLabel("");
    setSlotTimezone(getDefaultSlotTimezone());
  };

  const upsertSlot = useCallback((nextSlot: EventSlotRow) => {
    setSlots((current) =>
      [...current.filter((slot) => slot.id !== nextSlot.id), nextSlot].sort((left, right) => {
        if (left.event_date !== right.event_date) {
          return left.event_date.localeCompare(right.event_date);
        }
        return new Date(left.starts_at || "").getTime() - new Date(right.starts_at || "").getTime();
      })
    );
  }, []);

  const handleSaveSlot = async () => {
    if (saveSlotLockRef.current || isSaving) {
      return;
    }

    if (selectedDateRestriction) {
      setError(selectedDateRestriction);
      setSuccess(null);
      return;
    }

    saveSlotLockRef.current = true;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        date: selectedDate,
        start_time: normalizeTimeInputValue(slotTime),
        duration_minutes: slotDuration,
        timezone: normalizeTimezoneValue(slotTimezone),
        slot_label: slotLabel.trim() || null,
        ...(editingSlotId ? { is_active: true } : {}),
      };

      const response = editingSlotId
        ? await adminFetch<SlotMutationResponse>("/backend/api/v1/appointments/admin/early-access/slots/" + editingSlotId, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await adminFetch<SlotMutationResponse>("/backend/api/v1/appointments/admin/early-access/slots", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      upsertSlot(response.slot);
      setSuccess(response.message || (editingSlotId ? "Slot updated." : "Slot created."));
      resetForm();
      void load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save the slot.");
    } finally {
      saveSlotLockRef.current = false;
      setIsSaving(false);
    }
  };

  const handleToggleDateAvailability = async (makeAvailable: boolean) => {
    if (!selectedDateCanToggleAvailability) return;

    setIsTogglingDateAvailability(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await adminFetch<{ message: string; available_date_overrides?: string[] }>(
        "/backend/api/v1/appointments/admin/early-access/date-overrides/" + selectedDate,
        {
          method: makeAvailable ? "PUT" : "DELETE",
        }
      );

      if (Array.isArray(response.available_date_overrides)) {
        setAvailableDateOverrides(response.available_date_overrides);
      }
      setSuccess(response.message || (makeAvailable ? "Date is now available for slots." : "Date reset to unavailable."));
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update date availability.");
    } finally {
      setIsTogglingDateAvailability(false);
    }
  };

  const handleEditSlot = (slot: EventSlotRow) => {
    setEditingSlotId(slot.id);
    setSelectedDate(slot.event_date);
    setVisibleMonth(startOfMonth(parseDateKey(slot.event_date)));
    setSlotTime(getTimeInputValue(slot.starts_at, slot.timezone));
    setSlotDuration(getDurationMinutes(slot));
    setSlotLabel(slot.slot_label || "");
    setSlotTimezone(normalizeTimezoneValue(slot.timezone || getDefaultSlotTimezone()));
    setError(null);
    setSuccess(null);
  };

  const handleDeleteSlot = async (slotId: string) => {
    setDeletingSlotId(slotId);
    setError(null);
    setSuccess(null);
    try {
      const response = await adminFetch<{ message: string }>("/backend/api/v1/appointments/admin/early-access/slots/" + slotId, {
        method: "DELETE",
      });
      setSuccess(response.message || "Slot deleted.");
      if (editingSlotId === slotId) {
        resetForm();
      }
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete the slot.");
    } finally {
      setDeletingSlotId(null);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    setCancellingBookingId(bookingId);
    setError(null);
    setSuccess(null);
    try {
      const response = await adminFetch<{ message: string }>("/backend/api/v1/appointments/admin/early-access/bookings/" + bookingId, {
        method: "DELETE",
      });
      setSuccess(response.message || "Booking cancelled.");
      await load();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Failed to cancel the booking.");
    } finally {
      setCancellingBookingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-[22px] border border-red-500/25 bg-[#140b0b] px-5 py-4 text-sm text-red-100">{error}</div> : null}
      {success ? <div className="rounded-[22px] border border-emerald-500/25 bg-[#0d1510] px-5 py-4 text-sm text-emerald-100">{success}</div> : null}

      <section className="rounded-[26px] border border-white/8 bg-[#101010] p-4">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Total Slots", slots.length],
            ["Active Dates", availableDateSet.size],
            ["Booked Appointments", bookings.filter((booking) => booking.status === "booked").length],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-[20px] border border-white/8 bg-[#151515] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">{label}</div>
              <div className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] text-white">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionFrame
          title="Events Calendar"
          description={`Calendar is limited to ${EARLY_ACCESS_WINDOW_LABEL}. Green dates have open slots, amber dates are booked-only, and red dates are unavailable for new slots.`}
        >
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => canGoToPreviousMonth && setVisibleMonth((current) => addMonths(current, -1))}
              disabled={!canGoToPreviousMonth}
              className="rounded-full border border-white/10 bg-[#141414] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/78 transition hover:border-red-500/35 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Prev
            </button>
            <div className="text-lg font-semibold text-white">{monthLabel}</div>
            <button
              onClick={() => canGoToNextMonth && setVisibleMonth((current) => addMonths(current, 1))}
              disabled={!canGoToNextMonth}
              className="rounded-full border border-white/10 bg-[#141414] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/78 transition hover:border-red-500/35 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Next
            </button>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-white/28">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const isWithinWindow = isDateWithinEarlyAccessWindow(day.key);
              const isUnavailable = isEarlyAccessUnavailableDate(day.key, availableDateOverrideSet);
              const isSelected = day.key === selectedDate;
              const isAvailable = availableDateSet.has(day.key);
              const isFilled = filledDateSet.has(day.key);

              return (
                <button
                  key={day.key}
                  onClick={() => {
                    if (!isWithinWindow) return;
                    setSelectedDate(day.key);
                    setVisibleMonth(startOfMonth(parseDateKey(day.key)));
                  }}
                  disabled={!isWithinWindow}
                  className={`relative min-h-[86px] rounded-[20px] border px-3 py-3 text-left transition ${
                    !isWithinWindow
                      ? "cursor-not-allowed border-white/5 bg-[#090909] text-white/16"
                      : isSelected
                        ? isUnavailable
                          ? "border-red-400/55 bg-[#210d0d] text-red-100"
                          : "border-red-500/45 bg-[#1b0f0f] text-white"
                        : isUnavailable
                          ? "border-red-500/25 bg-[#190d0d] text-red-100 hover:border-red-500/45"
                          : day.isCurrentMonth
                            ? "border-white/8 bg-[#121212] text-white/86 hover:border-red-500/28"
                            : "border-white/8 bg-[#0e0e0e] text-white/50 hover:border-white/14"
                  }`}
                >
                  <div className="text-lg font-semibold">{day.day}</div>
                  {isUnavailable ? <span className="absolute bottom-3 left-3 h-2.5 w-2.5 rounded-full bg-red-400" /> : null}
                  {!isUnavailable && isAvailable ? <span className="absolute bottom-3 left-3 h-2.5 w-2.5 rounded-full bg-emerald-400" /> : null}
                  {!isUnavailable && !isAvailable && isFilled ? <span className="absolute bottom-3 left-3 h-2.5 w-2.5 rounded-full bg-amber-400" /> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-4 text-xs text-white/52">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              Available date
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              Booked-only date
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
              Unavailable date
            </div>
          </div>
        </SectionFrame>

        <SectionFrame
          title="Early Access Slots"
          description="Pick a date on the calendar, then add or edit available time slots for that day."
        >
          <div className="rounded-[20px] border border-white/8 bg-[#121212] px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Selected Date</div>
            <div className="mt-2 text-xl font-semibold text-white">{formatDateLabel(selectedDate)}</div>
            <div className={`mt-1 text-sm ${selectedDateRestriction ? "text-red-200" : "text-white/46"}`}>
              {selectedDateRestriction || `${selectedDateSlots.length} slot(s) on this date`}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {selectedDateSlots.length > 0 ? (
              selectedDateSlots.map((slot) => (
                <div key={slot.id} className="rounded-[20px] border border-white/8 bg-[#121212] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">{slot.slot_label}</div>
                      <div className="mt-1 text-sm text-white/46">
                        {slot.start_time_label} {slot.end_time_label ? `- ${slot.end_time_label}` : ""} · {slot.timezone}
                      </div>
                      <div className="mt-2 text-xs uppercase tracking-[0.2em] text-white/32">
                        {slot.is_booked ? `Booked by ${slot.booked_by || "a user"}` : slot.is_active ? "Available" : "Inactive"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleEditSlot(slot)}
                        disabled={slot.is_booked}
                        className="rounded-full border border-white/10 bg-[#141414] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/78 transition hover:border-red-500/35 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDeleteSlot(slot.id)}
                        disabled={slot.is_booked || deletingSlotId === slot.id}
                        className="rounded-full border border-red-500/18 bg-[#160b0b] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-red-200 transition hover:border-red-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {deletingSlotId === slot.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[20px] border border-dashed border-white/10 bg-[#0f0f0f] px-4 py-8 text-sm text-white/42">
                {isBusy ? "Loading slots..." : selectedDateRestriction ? "This date is unavailable. No slots can be added here." : "No slots saved for this date yet."}
              </div>
            )}
          </div>

          <div className="mt-5 rounded-[22px] border border-white/8 bg-[#0e0e0e] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                  {editingSlotId ? "Edit Slot" : "Add Slot"}
                </div>
                <div className="mt-2 text-base font-semibold text-white">
                  {editingSlotId ? "Update the selected time slot" : "Create a new time slot for this day"}
                </div>
              </div>
              {editingSlotId ? (
                <button
                  onClick={resetForm}
                  className="rounded-full border border-white/10 bg-[#141414] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/78 transition hover:border-red-500/35 hover:text-red-300"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {selectedDateRestriction ? (
              <div className="mt-4 rounded-[18px] border border-red-500/25 bg-[#170d0d] px-4 py-3 text-sm text-red-100">
                {selectedDateRestriction}
              </div>
            ) : null}

            {selectedDateCanToggleAvailability ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void handleToggleDateAvailability(!selectedDateHasManualAvailability)}
                  disabled={isTogglingDateAvailability}
                  className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    selectedDateHasManualAvailability
                      ? "border border-white/10 bg-[#141414] text-white/78 hover:border-red-500/35 hover:text-red-300"
                      : "bg-red-500 text-black hover:bg-white hover:text-red-500"
                  }`}
                >
                  {isTogglingDateAvailability
                    ? "Saving..."
                    : selectedDateHasManualAvailability
                      ? "Reset To Unavailable"
                      : "Make Date Available"}
                </button>
                <div className="text-xs text-white/42">
                  {selectedDateHasManualAvailability
                    ? "This normally blocked date has been reopened by admin."
                    : "Use this if you want to allow slots on this blocked date."}
                </div>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38">Start Time</label>
                <input
                  type="time"
                  value={slotTime}
                  onChange={(event) => setSlotTime(event.target.value)}
                  className="w-full rounded-[18px] border border-white/10 bg-[#131313] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/35"
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38">Duration</label>
                <input
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  value={slotDuration}
                  onChange={(event) => setSlotDuration(Math.max(15, Number(event.target.value || 30)))}
                  className="w-full rounded-[18px] border border-white/10 bg-[#131313] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/35"
                />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38">Timezone</label>
                <input
                  value={slotTimezone}
                  onChange={(event) => setSlotTimezone(event.target.value)}
                  className="w-full rounded-[18px] border border-white/10 bg-[#131313] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/35"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38">Custom Label</label>
              <input
                value={slotLabel}
                onChange={(event) => setSlotLabel(event.target.value.slice(0, 120))}
                placeholder="Optional: Founder walkthrough, Product Q&A, etc."
                className="w-full rounded-[18px] border border-white/10 bg-[#131313] px-4 py-3 text-sm text-white outline-none transition focus:border-red-500/35"
              />
            </div>

            <button
              onClick={() => void handleSaveSlot()}
              disabled={isSaving || Boolean(selectedDateRestriction)}
              className="mt-5 rounded-full bg-red-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-white hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving..." : editingSlotId ? "Update Slot" : "Add Slot"}
            </button>
          </div>
        </SectionFrame>
      </div>

      <SectionFrame
        title="Booked Appointments"
        description="Every appointment booked from the public portal lands here. Cancel one if you need to free the slot."
      >
        <div className="overflow-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-white/8">
                {["Date", "Time Slot", "Booked By", "Rating", "Booked At", "Actions"].map((label) => (
                  <th key={label} className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.22em] text-white/38">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.length > 0 ? (
                bookings.map((booking) => (
                  <tr key={booking.id} className="border-b border-white/6 last:border-b-0">
                    <td className="px-3 py-4 text-sm text-white/76">{booking.slot.event_date}</td>
                    <td className="px-3 py-4 text-sm text-white/76">
                      <div className="font-semibold text-white">{booking.slot.slot_label}</div>
                      <div className="mt-1 text-xs text-white/42">{booking.slot.timezone}</div>
                    </td>
                    <td className="px-3 py-4 text-sm text-white/76">
                      <div>{booking.booked_email}</div>
                      {booking.review_text ? <div className="mt-1 max-w-[320px] truncate text-xs text-white/42">{booking.review_text}</div> : null}
                    </td>
                    <td className="px-3 py-4 text-sm text-white/76">{booking.review_rating ? `${booking.review_rating}/5` : "-"}</td>
                    <td className="px-3 py-4 text-sm text-white/76">{formatDateTime(booking.created_at)}</td>
                    <td className="px-3 py-4">
                      {booking.status === "booked" ? (
                        <button
                          onClick={() => void handleCancelBooking(booking.id)}
                          disabled={cancellingBookingId === booking.id}
                          className="rounded-full border border-red-500/18 bg-[#160b0b] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-red-200 transition hover:border-red-500/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {cancellingBookingId === booking.id ? "Cancelling..." : "Cancel"}
                        </button>
                      ) : (
                        <span className="text-xs uppercase tracking-[0.2em] text-white/32">{booking.status}</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-white/42">
                    {isBusy ? "Loading bookings..." : "No appointments booked yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionFrame>
    </div>
  );
}
