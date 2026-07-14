import { TimesheetAnalysisResult } from "./types";

export interface DemoSample {
  id: string;
  title: string;
  description: string;
  imagePlaceholder: string; // Describes what the screenshot looks like
  result: TimesheetAnalysisResult;
}

export const DEMO_SAMPLES: DemoSample[] = [
  {
    id: "sample-1",
    title: "كشف دوام - أحمد عبد الله (موظف ملتزم مع مغادرة وإجازة مرضية)",
    description: "تأخير بسيط مع وجود مغادرة رسمية مغطاة، وإجازة مرضية لمدة يومين وغياب غير مبرر يوم الأحد.",
    imagePlaceholder: "لقطة شاشة لكشف دوام الموظف أحمد عبد الله لشهر يوليو 2026",
    result: {
      employee_info: {
        id: "1042",
        name: "أحمد عبد الله الحربي",
        role: "مهندس برمجيات أقدم"
      },
      kpis: {
        totalDelayMinutes: 45,
        totalEarlyOutMinutes: 0,
        totalAbsences: 1,
        totalLeavesUsed: 2,
        totalWorkingDays: 7,
        perfectComplianceDays: 1,
        correctAttendancePercentage: 14,
        totalWorkHours: 56.83,
        totalDuplicateFingerprintDays: 0
      },
      duplicateFingerprintsSummary: [],
      daily_report: [
        {
          date: "05-07-2026",
          dayName: "الأحد",
          checkIn: "08:15:00",
          checkOut: "17:02:00",
          status: "تأخير 15 دقيقة",
          statusStyle: "danger",
          delayMinutes: 15,
          note: "تأخير غير معذور",
          isWeekend: false
        },
        {
          date: "06-07-2026",
          dayName: "الاثنين",
          checkIn: "07:55:00",
          checkOut: "17:05:00",
          status: "حضور منتظم",
          statusStyle: "success",
          delayMinutes: 0,
          note: "في الوقت المحدد",
          isWeekend: false
        },
        {
          date: "07-07-2026",
          dayName: "الثلاثاء",
          checkIn: "08:45:00",
          checkOut: "17:00:00",
          status: "تأخير معذور بمغادرة",
          statusStyle: "warning",
          delayMinutes: 0,
          note: "مغادرة رسمية من 08:00 إلى 09:00",
          isWeekend: false
        },
        {
          date: "08-07-2026",
          dayName: "الأربعاء",
          checkIn: null,
          checkOut: null,
          status: "إجازة رسمية (إجازة مرضية)",
          statusStyle: "warning",
          delayMinutes: 0,
          note: "مغطى بإجازة: إجازة مرضية",
          isWeekend: false
        },
        {
          date: "09-07-2026",
          dayName: "الخميس",
          checkIn: null,
          checkOut: null,
          status: "إجازة رسمية (إجازة مرضية)",
          statusStyle: "warning",
          delayMinutes: 0,
          note: "مغطى بإجازة: إجازة مرضية",
          isWeekend: false
        },
        {
          date: "10-07-2026",
          dayName: "الجمعة",
          checkIn: null,
          checkOut: null,
          status: "عطلة نهاية الأسبوع",
          statusStyle: "secondary",
          delayMinutes: 0,
          note: "",
          isWeekend: true
        },
        {
          date: "11-07-2026",
          dayName: "السبت",
          checkIn: null,
          checkOut: null,
          status: "عطلة نهاية الأسبوع",
          statusStyle: "secondary",
          delayMinutes: 0,
          note: "",
          isWeekend: true
        },
        {
          date: "12-07-2026",
          dayName: "الأحد",
          checkIn: null,
          checkOut: null,
          status: "غياب بدون عذر",
          statusStyle: "danger",
          delayMinutes: 0,
          note: "لم يتم رصد أي حركات حضور أو خروج",
          isWeekend: false
        },
        {
          date: "13-07-2026",
          dayName: "الاثنين",
          checkIn: "08:30:00",
          checkOut: "17:10:00",
          status: "تأخير 30 دقيقة",
          statusStyle: "danger",
          delayMinutes: 30,
          note: "تأخير غير معذور",
          isWeekend: false
        }
      ],
      extracted_data: {
        employee_info: {
          id: "1042",
          name: "أحمد عبد الله الحربي",
          role: "مهندس برمجيات أقدم"
        },
        attendance_records: [
          { day: "الأحد", date: "05-07-2026", time: "08:15:00", type: "حضور" },
          { day: "الأحد", date: "05-07-2026", time: "17:02:00", type: "خروج" },
          { day: "الاثنين", date: "06-07-2026", time: "07:55:00", type: "حضور" },
          { day: "الاثنين", date: "06-07-2026", time: "17:05:00", type: "خروج" },
          { day: "الثلاثاء", date: "07-07-2026", time: "08:45:00", type: "حضور" },
          { day: "الثلاثاء", date: "07-07-2026", time: "17:00:00", type: "خروج" },
          { day: "الاثنين", date: "13-07-2026", time: "08:30:00", type: "حضور" },
          { day: "الاثنين", date: "13-07-2026", time: "17:10:00", type: "خروج" }
        ],
        permissions: [
          { date: "07-07-2026", start_time: "08:00:00", end_time: "09:00:00" }
        ],
        leaves: [
          { start_date: "08-07-2026", end_date: "09-07-2026", leave_type: "إجازة مرضية" }
        ]
      }
    }
  },
  {
    id: "sample-2",
    title: "كشف دوام - سارة عبد الرحمن (متأخرة تكراراً وبدون مغادرات)",
    description: "كشف يظهر نمط تأخر متكرر عن الدوام في معظم الأيام مع غياب يومين متتاليين غير مبررين.",
    imagePlaceholder: "لقطة شاشة لكشف دوام الموظفة سارة عبد الرحمن لشهر يوليو 2026",
    result: {
      employee_info: {
        id: "2087",
        name: "سارة عبد الرحمن البقمي",
        role: "أخصائية خدمة عملاء"
      },
      kpis: {
        totalDelayMinutes: 195,
        totalEarlyOutMinutes: 0,
        totalAbsences: 2,
        totalLeavesUsed: 0,
        totalWorkingDays: 7,
        perfectComplianceDays: 0,
        correctAttendancePercentage: 0,
        totalWorkHours: 56.35,
        totalDuplicateFingerprintDays: 0
      },
      duplicateFingerprintsSummary: [],
      daily_report: [
        {
          date: "05-07-2026",
          dayName: "الأحد",
          checkIn: "08:45:00",
          checkOut: "17:00:00",
          status: "تأخير 45 دقيقة",
          statusStyle: "danger",
          delayMinutes: 45,
          note: "تأخير غير معذور",
          isWeekend: false
        },
        {
          date: "06-07-2026",
          dayName: "الاثنين",
          checkIn: "08:50:00",
          checkOut: "17:05:00",
          status: "تأخير 50 دقيقة",
          statusStyle: "danger",
          delayMinutes: 50,
          note: "تأخير غير معذور",
          isWeekend: false
        },
        {
          date: "07-07-2026",
          dayName: "الثلاثاء",
          checkIn: "09:10:00",
          checkOut: "17:00:00",
          status: "تأخير 70 دقيقة",
          statusStyle: "danger",
          delayMinutes: 70,
          note: "تأخير غير معذور",
          isWeekend: false
        },
        {
          date: "08-07-2026",
          dayName: "الأربعاء",
          checkIn: null,
          checkOut: null,
          status: "غياب بدون عذر",
          statusStyle: "danger",
          delayMinutes: 0,
          note: "لم يتم رصد أي حركات حضور أو خروج",
          isWeekend: false
        },
        {
          date: "09-07-2026",
          dayName: "الخميس",
          checkIn: null,
          checkOut: null,
          status: "غياب بدون عذر",
          statusStyle: "danger",
          delayMinutes: 0,
          note: "لم يتم رصد أي حركات حضور أو خروج",
          isWeekend: false
        },
        {
          date: "10-07-2026",
          dayName: "الجمعة",
          checkIn: null,
          checkOut: null,
          status: "عطلة نهاية الأسبوع",
          statusStyle: "secondary",
          delayMinutes: 0,
          note: "",
          isWeekend: true
        },
        {
          date: "11-07-2026",
          dayName: "السبت",
          checkIn: null,
          checkOut: null,
          status: "عطلة نهاية الأسبوع",
          statusStyle: "secondary",
          delayMinutes: 0,
          note: "",
          isWeekend: true
        },
        {
          date: "12-07-2026",
          dayName: "الأحد",
          checkIn: "08:30:00",
          checkOut: "17:00:00",
          status: "تأخير 30 دقيقة",
          statusStyle: "danger",
          delayMinutes: 30,
          note: "تأخير غير معذور",
          isWeekend: false
        }
      ],
      extracted_data: {
        employee_info: {
          id: "2087",
          name: "سارة عبد الرحمن البقمي",
          role: "أخصائية خدمة عملاء"
        },
        attendance_records: [
          { day: "الأحد", date: "05-07-2026", time: "08:45:00", type: "حضور" },
          { day: "الأحد", date: "05-07-2026", time: "17:00:00", type: "خروج" },
          { day: "الاثنين", date: "06-07-2026", time: "08:50:00", type: "حضور" },
          { day: "الاثنين", date: "06-07-2026", time: "17:05:00", type: "خروج" },
          { day: "الثلاثاء", date: "07-07-2026", time: "09:10:00", type: "حضور" },
          { day: "الثلاثاء", date: "07-07-2026", time: "17:00:00", type: "خروج" },
          { day: "الأحد", date: "12-07-2026", time: "08:30:00", type: "حضور" },
          { day: "الأحد", date: "12-07-2026", time: "17:00:00", type: "خروج" }
        ],
        permissions: [],
        leaves: []
      }
    }
  }
];
