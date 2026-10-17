"use client";

import { useMemo } from "react";
import styles from "./AdminScheduleCalendar.module.css";
import {
  calendarDays, edmontonToday, edmontonWall, isSaturday,
  stepCalendarDate,
} from "@/lib/scheduling/sharedChair.mjs";
import {
  appointmentsForDay, calendarLabel, clockLabel, countAppointmentsForDay,
  slotsForDay, timelinePlacement,
} from "@/lib/scheduling/visualCalendar.mjs";

const artistOptions = [
  { value: "all", label: "Both artists" },
  { value: "ben", label: "Ben" },
  { value: "autumn", label: "Autumn" },
  { value: "general", label: "Undecided" },
];
const durationOptions = [
  { value: "30", label: "30 min" }, { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" }, { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" }, { value: "240", label: "4 hours" },
  { value: "300", label: "5 hours" }, { value: "480", label: "8 hours" },
];
const timeLabels = Array.from({ length: 10 }, (_, i) => clockLabel(String(11 + i).padStart(2, "0") + ":00"));

function AppointmentTile({ appointment, onOpen, style, className = "" }) {
  const cancelled = appointment.status === "cancelled";
  const color = appointment.assignedInbox === "ben" ? "ben" : appointment.assignedInbox === "autumn" ? "autumn" : "general";
  const start = edmontonWall(appointment.startAt).slice(11);
  return (
    <button type="button" className={[styles["fc-appointment"], styles["fc-appointment-" + color], cancelled ? styles["fc-cancelled"] : "", className].filter(Boolean).join(" ")}
      style={style} onClick={() => onOpen(appointment)}
      title={`${appointment.title || appointment.clientName || "Appointment"} · ${start} · ${appointment.status || "Tentative"}`}>
      <strong>{start} · {appointment.assignedInbox || "General"}</strong>
      <span>{appointment.title || appointment.clientName || "Appointment"}</span>
      <small>{appointment.status || "Tentative"}</small>
    </button>
  );
}

export default function AdminScheduleCalendar({
  date, onDate, view, onView, artist, onArtist, durationMinutes,
  onDurationMinutes, appointments, onChooseSlot, onOpenAppointment,
  selectedSlot,
}) {
  const today = edmontonToday();
  const weekDays = calendarDays(date, "week");
  const displayedDays = calendarDays(date, view);
  const slots = useMemo(
    () => slotsForDay(date, durationMinutes, appointments),
    [date, durationMinutes, appointments]
  );
  const focusedAppointments = appointmentsForDay(appointments, date, artist);
  const availableCount = slots.filter(slot => slot.available).length;
  const label = view === "month"
    ? calendarLabel(date, { month: "long", year: "numeric" })
    : calendarLabel(date, { month: "long", day: "numeric", year: "numeric" });

  function jumpDay(day) {
    onDate(day);
    onView("day");
  }

  return (
    <section className={styles["fc-calendar"]} aria-label="Shared studio booking calendar">
      <div className={styles["fc-heading"]}>
        <div>
          <p className="eyebrow">Fawcett Tattoos · Studio Operations</p>
          <h2>Book from the calendar.</h2>
          <p>One studio chair · Ben + Autumn · Edmonton time</p>
        </div>
        <a className="button button-primary" href="#schedule-create-appointment">+ New appointment</a>
      </div>

      <div className={styles["fc-toolbar"]}>
        <div className={styles["fc-date-nav"]}>
          <button type="button" aria-label="Previous period" onClick={() => onDate(stepCalendarDate(date, view, -1))}>←</button>
          <button type="button" onClick={() => onDate(today)}>Today</button>
          <button type="button" aria-label="Next period" onClick={() => onDate(stepCalendarDate(date, view, 1))}>→</button>
          <strong>{label}</strong>
        </div>
        <div className={styles["fc-view-tabs"]} aria-label="Calendar view">
          {["day", "week", "month"].map(option => (
            <button key={option} type="button" aria-pressed={view === option}
              className={view === option ? styles.active : ""} onClick={() => onView(option)}>
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className={styles["fc-filters"]}>
        <label>Jump to date
          <input type="date" value={date} onChange={event => onDate(event.target.value)} />
        </label>
        <label>Show appointments for
          <select value={artist} onChange={event => onArtist(event.target.value)}>
            {artistOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>Session length
          <select value={durationMinutes} onChange={event => onDurationMinutes(event.target.value)}>
            {durationOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <div className={styles["fc-legend"]} aria-label="Calendar legend">
        <span className={[styles["fc-dot"], styles["fc-dot-ben"]].join(" ")}/>Ben
        <span className={[styles["fc-dot"], styles["fc-dot-autumn"]].join(" ")}/>Autumn
        <span className={[styles["fc-dot"], styles["fc-dot-general"]].join(" ")}/>Unassigned
        <span className={[styles["fc-dot"], styles["fc-dot-available"]].join(" ")}/>Potentially open
      </div>

      {view !== "month" && (
        <div className={styles["fc-day-strip"]} aria-label="Choose day">
          {weekDays.map(day => (
            <button type="button" key={day} aria-pressed={date === day} className={date === day ? styles.active : ""}
              onClick={() => onDate(day)}>
              <small>{calendarLabel(day, { weekday: "short" })}</small>
              <strong>{day.slice(-2)}</strong>
              {isSaturday(day) ? <small>Closed</small> : <small>{countAppointmentsForDay(appointments, day)} appt.</small>}
            </button>
          ))}
        </div>
      )}

      {view === "month" && (
        <div className={styles["fc-month-grid"]} aria-label="Month calendar">
          {displayedDays.map(day => {
            const count = countAppointmentsForDay(appointments, day);
            return <button type="button" key={day} onClick={() => jumpDay(day)}
              className={[styles["fc-month-day"], day === today ? styles.today : "", day.slice(0,7) !== date.slice(0,7) ? styles.outside : ""].filter(Boolean).join(" ")}>
              <small>{calendarLabel(day, { weekday: "short" })}</small>
              <strong>{Number(day.slice(-2))}</strong>
              <span>{isSaturday(day) ? "Closed" : count ? `${count} booked` : "—"}</span>
            </button>;
          })}
        </div>
      )}

      {view !== "month" && (
        <div className={styles["fc-week-timeline"]} aria-label={view === "day" ? "Daily appointment timeline" : "Weekly appointment timeline"}>
          <div className={styles["fc-hours"]}>
            {timeLabels.map((time, i) => <span key={time} style={{ top: `${(i / 9) * 100}%` }}>{time}</span>)}
          </div>
          {(view === "day" ? [date] : displayedDays).map(day => {
            const entries = appointmentsForDay(appointments, day, artist);
            return <div className={styles["fc-timeline-column"]} key={day}>
              <button type="button" className={styles["fc-timeline-day-title"]} onClick={() => jumpDay(day)}>
                {calendarLabel(day, { weekday: "short", month: "short", day: "numeric" })}
                {isSaturday(day) && " · Closed"}
              </button>
              <div className={[styles["fc-timeline-track"], isSaturday(day) ? styles.closed : ""].filter(Boolean).join(" ")}>
                {entries.map(entry => {
                  const placement = timelinePlacement(entry);
                  if (!placement) return null;
                  return <AppointmentTile key={entry.id} appointment={entry} onOpen={onOpenAppointment}
                    className={styles["fc-positioned"]} style={{ top: `${placement.top}%`, height: `${placement.height}%` }}/>;
                })}
              </div>
              {entries.some(entry => !timelinePlacement(entry)) && (
                <p className={styles["fc-outside-hours"]}>{entries.filter(entry => !timelinePlacement(entry)).length} historical item(s) outside displayed hours — see agenda below</p>
              )}
            </div>;
          })}
        </div>
      )}

      <div className={styles["fc-mobile-agenda"]} aria-label="Appointments for selected day">
        <div className={styles["fc-section-heading"]}>
          <h3>{calendarLabel(date, { weekday: "long", month: "long", day: "numeric" })}</h3>
          <span>{focusedAppointments.length} appointments</span>
        </div>
        {focusedAppointments.length === 0
          ? <p className={styles["fc-empty"]}>No appointments listed for this day and artist.</p>
          : <div className={styles["fc-agenda-list"]}>{focusedAppointments.map(entry =>
            <AppointmentTile key={entry.id} appointment={entry} onOpen={onOpenAppointment}/>)}</div>}
      </div>

      <div className={styles["fc-slots"]} aria-label="Choose potential booking time">
        <div className={styles["fc-section-heading"]}>
          <div>
            <h3>Choose a start time</h3>
            <p>{calendarLabel(date, { weekday: "long", month: "short", day: "numeric" })} · {durationOptions.find(d => d.value === String(durationMinutes))?.label || durationMinutes + " min"}</p>
          </div>
          <strong>{availableCount} potentially open</strong>
        </div>
        {isSaturday(date) ? (
          <p className={styles["fc-empty"]}>Saturdays are closed. Select Sunday–Friday.</p>
        ) : !slots.length ? (
          <p className={styles["fc-empty"]}>There are no valid start times for this session length.</p>
        ) : (
          <div className={styles["fc-slot-grid"]}>
            {slots.map(slot => {
              const active = selectedSlot?.day === slot.day && selectedSlot?.time === slot.time;
              return <button key={slot.time} type="button" disabled={!slot.available}
                className={[styles["fc-slot"], active ? styles.selected : ""].filter(Boolean).join(" ")}
                aria-pressed={slot.available ? active : undefined}
                title={slot.reason}
                onClick={() => onChooseSlot(slot.day, slot.time)}>
                {slot.label}
                <small>{slot.available ? active ? "Selected" : "Open*" : slot.reason}</small>
              </button>;
            })}
          </div>
        )}
        <p className={styles["fc-disclaimer"]}>*Slots are suggestions from current studio records, not confirmed availability. All bookings require a client and a fresh conflict check when saved. Both artists share one chair; filtering by artist never frees occupied time. Existing Apple Calendar events are not synced, and simultaneous bookings are not transaction-locked.</p>
      </div>
    </section>
  );
}
