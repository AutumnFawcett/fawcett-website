"use client";

import { useState } from "react";
import AdminScheduleCalendar from "@/components/AdminScheduleCalendar";
import { edmontonDateTime } from "@/lib/scheduling/sharedChair.mjs";

const demoAppointments = [
  { id: "sample-ben", clientName: "Example client A", title: "Half-sleeve session",
    assignedInbox: "ben", status: "booked",
    startAt: edmontonDateTime("2026-10-19","11:30"), endAt: edmontonDateTime("2026-10-19","14:00") },
  { id: "sample-autumn", clientName: "Example client B", title: "Floral tattoo",
    assignedInbox: "autumn", status: "confirmed",
    startAt: edmontonDateTime("2026-10-19","15:00"), endAt: edmontonDateTime("2026-10-19","17:00") },
  { id: "sample-consult", clientName: "Example client C", title: "Design consult",
    assignedInbox: "general", status: "tentative",
    startAt: edmontonDateTime("2026-10-20","12:00"), endAt: edmontonDateTime("2026-10-20","13:00") },
  { id: "sample-touchup", clientName: "Example client D", title: "Touch-up",
    assignedInbox: "ben", status: "cancelled",
    startAt: edmontonDateTime("2026-10-21","11:00"), endAt: edmontonDateTime("2026-10-21","12:00") },
];

export default function StudioCalendarDemo() {
  const [date,setDate] = useState("2026-10-19");
  const [view,setView] = useState("week");
  const [artist,setArtist] = useState("all");
  const [duration,setDuration] = useState("60");
  const [slot,setSlot] = useState(null);
  const [opened,setOpened] = useState(null);

  return <main className="admin-page schedule-page">
    <div className="mx-auto mb-4 max-w-[1400px] rounded-2xl border border-[#9999ff] bg-[#000044] p-4">
      <h1 className="text-xl font-black">Fawcett Calendar · Interactive Design Preview</h1>
      <p className="mt-2 text-sm">Synthetic examples only. No live Firebase connection, client records, booking actions or payments. Test the day / week / month controls, filters, and time slots.</p>
    </div>
    <AdminScheduleCalendar
      date={date} onDate={setDate} view={view} onView={setView}
      artist={artist} onArtist={setArtist} durationMinutes={duration}
      onDurationMinutes={(next)=>{setDuration(next);setSlot(null);}}
      appointments={demoAppointments}
      onChooseSlot={(day,time)=>{setSlot({day,time});setOpened(null);}}
      onOpenAppointment={(entry)=>{setOpened(entry);setSlot(null);}}
      selectedSlot={slot}
    />
    <section id="schedule-create-appointment" className="mx-auto max-w-[1400px] rounded-2xl border border-white/20 p-5">
      <h2 className="text-xl font-black">Booking preview — no records created</h2>
      {slot ? <p className="mt-2">You selected <strong>{slot.day} at {slot.time}</strong> for a {duration}-minute appointment. The real admin page would prefill the client booking form.</p>
        : opened ? <p className="mt-2">You opened <strong>{opened.title}</strong>. The real admin page would show its editable details.</p>
        : <p className="mt-2">Select a sample appointment or potentially open time above to try the flow.</p>}
    </section>
  </main>;
}
