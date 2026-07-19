import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Lang = "ar" | "en";

interface LangContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const translations: Record<Lang, Record<string, string>> = {
  ar: {
    // App-wide
    appTitle: "محلل كشوفات الدوام الذكي",
    appSubtitle: "أتمتة تحليل لقطات شاشة الحضور والغياب للغة العربية بالذكاء الاصطناعي",
    skipToContent: "الانتقال إلى المحتوى الرئيسي",
    cancel: "إلغاء",
    save: "حفظ",
    delete: "حذف",
    close: "إغلاق",
    confirm: "تأكيد",
    search: "بحث",
    loading: "جاري التحميل...",
    edit: "تعديل",
    add: "إضافة",
    remove: "إزالة",
    clear: "مسح",
    hours: "ساعة",
    hour: "ساعة",
    hoursShort: "س",
    days: "أيام",
    day: "يوم",
    minutes: "دقائق",
    minute: "دقيقة",
    minuteShort: "د",
    employees: "الموظفين",
    employee: "الموظف",
    employeeName: "اسم الموظف",
    total: "الإجمالي",
    name: "الاسم",
    type: "النوع",
    date: "التاريخ",
    notes: "ملاحظات",
    reason: "السبب",
    images: "صور",
    singleImage: "صورة",
    yes: "نعم",
    no: "لا",
    of: "من",
    from: "من",
    to: "إلى",

    // Header & Navigation
    tabReport: "التقرير",
    tabSchedule: "الجدول",
    tabOvertime: "الإضافي",
    adminLogin: "دخول المدير",
    adminLoginDesc: "أدخل باسورد المدير للحصول على صلاحيات كاملة",
    adminPasswordPlaceholder: "باسورد المدير",
    wrongPassword: "الباسورد غير صحيح",
    login: "دخول",
    guideTitle: "Guide",

    // Admin
    adminTitle: "لوحة التحكم",
    adminDesc: "عرض وإدارة جميع التقارير المحفوظة",
    totalReports: "إجمالي التقارير",
    totalEmployees: "إجمالي الموظفين",
    avgCompliance: "متوسط نسبة الالتزام",
    recentReports: "التقارير الأخيرة",
    noAdminData: "لا توجد تقارير محفوظة في النظام.",
    viewReport: "عرض التقرير",
    deleteReportAdmin: "حذف",
    backToMain: "العودة للرئيسية",

    // Upload
    uploadTitle: "تحميل كشف الدوام",
    uploadDesc: "قم بسحب وإفلات لقطة شاشة جدول الحضور باللغة العربية أو تصفح ملفاتك",
    uploadMultiDesc: "اسحب لقطات الشاشة أو تصفح ملفاتك — يمكن اختيار عدة صور",
    dragDrop: "اسحب لقطة الشاشة إلى هنا",
    dragDropHint: "تدعم الصور بصيغة PNG أو JPG أو JPEG",
    dragDropMultiHint: "PNG، JPG، JPEG — يمكن اختيار عدة صور",
    chooseFile: "اختر ملف",
    removeImage: "إزالة الصورة",
    changeImage: "غيّر الصورة",
    uploadedTimesheet: "كشف الدوام المرفوع",
    analyzeImageCount: "حلل {count} صور الآن",

    // Work Policies / Time
    workPolicies: "قواعد العمل",
    officialWorkHours: "ساعات الدوام الرسمي",
    startTime: "بداية الدوام (من):",
    endTime: "نهاية الدوام (إلى):",
    startLabel: "البداية",
    endLabel: "النهاية",
    timeHint: "اختر الأوقات الرسمية للتحليل (بفواصل نصف ساعة)",

    // Analyze
    analyze: "حلل لقطة الشاشة الآن",
    analyzing: "جاري المعالجة وقراءة الكشف...",
    noImageError: "يرجى رفع لقطة شاشة لكشف الدوام أولاً.",
    fileTypeError: "الرجاء اختيار ملف صورة صالح (PNG, JPEG, JPG).",
    compressionError: "حدث خطأ أثناء ضغط الصورة:",
    viewerCantAnalyze: "المشاهدون لا يمكنهم التحليل",

    // History / Saved Reports
    history: "السجلات المحفوظة",
    savedReports: "التقارير المحفوظة",
    noReports: "لا يوجد تقارير محفوظة حالياً.",
    clearAll: "مسح الكل",
    deleteReport: "حذف هذا التقرير",
    confirmDeleteHistory: "هل أنت متأكد من حذف جميع التقارير المحفوظة؟",
    numberLabel: "رقم:",
    delayBadge: "تأخير:",
    absenceBadge: "غياب:",

    // Empty State
    emptyState: "في انتظار رفع كشف الدوام",
    emptyStateDesc: "قم بتحميل لقطة شاشة لكشف الدوام من نظام الموارد البشرية لديكم لبدء معالجة واستخراج تقارير الحضور والإنصراف تلقائياً باستخدام الذكاء الاصطناعي.",

    // Employee Card
    employeeInfo: "بطاقة معلومات الموظف",
    employeeId: "الرقم الوظيفي",
    jobTitle: "المسمى الوظيفي",
    workPeriod: "فترة الدوام الرسمي",
    notAvailable: "غير متوفر",
    print: "طباعة",
    exportPDF: "PDF",
    exportExcel: "Excel",
    showJson: "JSON",
    hideJson: "إخفاء",

    // KPIs
    attendanceRate: "نسبة الالتزام",
    attendanceRateDesc: "الأيام الخالية من المخالفات",
    delayEarlyOut: "التأخير والخروج المبكر",
    delayEarlyOutDesc: "إجمالي دقائق التأخر والمغادرة",
    absences: "غياب بدون عذر",
    absencesDesc: "أيام العمل بدون سجلات حضور",
    leavesUsed: "الإجازات المستهلكة",
    leavesUsedDesc: "إجمالي أيام الإجازات الرسمية",
    workHours: "ساعات العمل الفعلية",
    workHoursDesc: "إجمالي ساعات الدوام المحسوبة",
    duplicateFp: "بصمات مكررة",
    duplicateFpDesc: "حركات دخول أو خروج مكررة",

    // Charts
    attendanceDistribution: "توزيع حالات الحضور",
    chartTitle: "منحنى التأخير والخروج المبكر",
    chartDesc: "دقائق التأخير والمغادرة غير المعذورة",
    chartDayLabel: "يوم {value}",
    chartMinuteUnit: "{value} د",
    tooltipMinute: "{value} دقيقة",

    // Late & Early Summary
    lateSummary: "ملخص التأخير والمغادرة",
    lateSummaryAuto: "تحليل تلقائي مع ربط التصاريح",
    perfectRecord: "سجل ممتاز!",
    perfectRecordDesc: "الموظف ملتزم تماماً بالدخول والخروج ولا توجد أي أيام متأخرة أو مغادرات غير معذورة.",
    lateDaysCount: "أيام التأخير ({count}):",
    earlyOutDays: "أيام المغادرة والخروج المبكر:",
    noLate: "لا توجد أيام تأخير.",
    noEarlyOut: "لا توجد مغادرات.",
    checkInLabel: "دخول:",
    checkOutLabel: "خروج:",

    // Duplicate Fingerprints
    duplicateFpAlert: "تنبيه: بصمات مكررة مكتشفة",
    duplicateFpRisk: "مخاطرة",
    duplicateFpDesc2: "تم اكتشاف حركات دخول أو خروج مكررة في بعض الأيام.",
    duplicateFpDays: "بصمات مكررة ({count} أيام)",
    alertBadge: "تنبيه",

    // Leave / Permission Tags
    leaveTaken: "تم أخذ إجازة",
    permissionTaken: "تم أخذ مغادرة",
    multipleCheckIns: "{count} حركات دخول",
    multipleCheckOuts: "{count} حركات خروج",
    officialLeave: "إجازة رسمية",
    leaveTypePlaceholder: "نوع الإجازة (مرضية، سنوية...)",
    approvedPermission: "مغادرة معتمدة",
    saveEdits: "حفظ التعديلات",
    editManually: "تعديل السجل يدوياً",
    editing: "تعديل...",
    clearToSetAbsence: "امسح لتحديد غياب/إجازة",

    // Filters
    all: "الكل",
    violations: "مخالفات",
    leavesFilter: "إجازات",
    regular: "المنتظرون",
    tableDayDate: "اليوم والتاريخ",
    tableCheckIn: "وقت الدخول",
    tableCheckOut: "وقت الخروج",
    tableWorkHours: "ساعات العمل",
    tableStatus: "حالة الالتزام",
    tableNotes: "ملاحظات التحليل",
    tableEdit: "تعديل",
    tableNoData: "لا توجد أيام مطابقة للفلتر المحدد.",
    tableFooter: "جميع البيانات خاضعة لعملية توحيد الأرقام.",
    tableTotalDays: "إجمالي الأيام: {count} يوم",

    // Table Status (used in recalculateRowAndKPIs)
    statusWeekend: "عطلة نهاية الأسبوع",
    statusRegular: "حضور منتظم",
    statusLateExcused: "تأخير معذور بمغادرة",
    statusLateUnexcused: "تأخير غير معذور",
    statusEarlyOut: "خروج مبكر",
    statusNoEntry: "بدون دخول",
    statusNoExit: "بدون خروج",
    statusAbsence: "غياب بدون عذر",
    statusLeaveOfficial: "إجازة رسمية ({type})",
    noteExcusedPermission: "مغادرة رسمية معتمدة.",
    noteLateUnexcused: "تأخير غير معذور.",
    noteEarlyOut: "خروج مبكر غير معذور.",
    noteNoEntry: "لم يتم رصد حركة دخول.",
    noteNoExit: "لم يتم رصد حركة خروج.",
    noteLeaveCovered: "مغطى بإجازة: {type}",
    noteAbsence: "لم يتم رصد أي حركات حضور أو خروج",
    noteOnTime: "في الوقت المحدد",
    statusExplainWeekend: "عطلة نهاية الأسبوع الرسمية.\nلا تحتسب ضمن أيام العمل الفعلية ولا تسجل عليها مخالفات.",
    statusExplainLeave: "إجازة رسمية معتمدة ({type}).\nيتم إعفاء الموظف بالكامل من تسجيل الحركات لهذا اليوم.",
    statusExplainAbsence: "غياب بدون عذر.\nلم يتم رصد أي حركة حضور (دخول) أو انصراف (خروج) في السجلات الرسمية لهذا اليوم العمل المعتاد.",
    statusExplainLate: "• تأخير: تم تسجيل الحضور الساعة {time}، وهي بعد موعد الدوام الرسمي {official} بمقدار {minutes} دقيقة.",
    statusExplainPermission: "• حضور معذور بمغادرة: تم تسجيل حضور متأخر ولكن بتفويض مغادرة معتمد.",
    statusExplainOnTime: "• حضور ملتزم: تم تسجيل الحضور الساعة {time}، قبل أو عند موعد بدء العمل {official}.",
    statusExplainNoEntry: "• بدون دخول: لم يتم تسجيل حركة دخول للعمل.",
    statusExplainEarlyOut: "• خروج مبكر: تم تسجيل الانصراف الساعة {time}، وهي قبل موعد انتهاء الدوام {official} بمقدار {minutes} دقيقة.",
    statusExplainOnTimeExit: "• انصراف ملتزم: تم تسجيل الانصراف الساعة {time}، عند أو بعد موعد انتهاء العمل {official}.",
    statusExplainNoExit: "• بدون خروج: لم يتم تسجيل حركة انصراف رسمية.",
    systemRuleTitle: "قاعدة احتساب النظام",
    systemRuleTransparency: "شفافية التحليل",

    // JSON Debug
    extractedDataJson: "البيانات المستخرجة الخام",
    downloadJson: "تحميل ملف JSON",

    // Detailed Report
    detailedReport: "السجل التفصيلي",
    reportSubtitle: "جدول الأيام مع التحليل التفصيلي",

    // How It Works
    howItWorks: "كيف يعمل محلل كشوفات الدوام؟",
    step1Title: "1. القراءة البصرية (OCR)",
    step1Desc: "يقوم محرك Gemini الفائق بتحليل لقطة الشاشة واستخراج جداول الحضور والتصاريح والإجازات.",
    step2Title: "2. توحيد وتنظيف البيانات",
    step2Desc: "تتحول جميع الأرقام الشرقية إلى أرقام غربية، وتُحول التواريخ والمدد الزمنية لمقارنتها بشكل آمن.",
    step3Title: "3. تطبيق القواعد البرمجية",
    step3Desc: "يقارن وقت الوصول بوقت الدوام الرسمي. يفحص جدول المغادرات لإلغاء المخالفة إذا كانت مغطاة، وإلا يُسجل كتأخير.",

    // Footer
    footer: "أتمتة تحليل كشوفات الدوام باللغة العربية",
    footerCopyright: "محلل كشوفات الدوام ©",

    // Dark mode
    darkMode: "الوضع الداكن",
    lightMode: "الوضع الفاتح",
    switchLang: "English",

    // Comparison & Trends (legacy)
    compareTitle: "مقارنة بين الموظفين",
    compareDesc: "قارن تقارير حضور عدة موظفين جنباً إلى جنب",
    addReport: "إضافة تقرير للمقارنة",
    noReportsToCompare: "لا توجد تقارير محفوظة للمقارنة.",
    trendsTitle: "الاتجاهات الشهرية",
    trendsDesc: "تتبع أنماط الحضور عبر عدة أشهر",
    month: "الشهر",
    avgDelay: "متوسط التأخير (دق)",
    totalAbsencesTrend: "إجمالي الغيابات",
    complianceRate: "نسبة الالتزام",
    noTrendsData: "لا توجد بيانات كافية لعرض الاتجاهات.",
    policiesTitle: "سياسات العمل المخصصة",
    gracePeriod: "فترة السماح (دقائق)",
    gracePeriodDesc: "دقائق إضافية بعد موعد الدوام يُسمح بالدخول بدون تأخير",
    overtimeThreshold: "عتبة العمل الإضافي (ساعات)",
    overtimeThresholdDesc: "الساعات الإضافية فوق الدوام الرسمي تُحسب كعمل إضافي",
    maxDelaysAllowed: "الحد الأقصى للتأخيرات الشهرية",
    maxDelaysAllowedDesc: "عدد مرات التأخير المسموح بها شهرياً",
    savePolicies: "حفظ السياسات",
    policiesSaved: "تم حفظ السياسات بنجاح!",

    // ==================== ScheduleManager ====================
    // Main
    scheduleTitle: "جدول الدوام",
    scheduleDesc: "اختر قسم لعرض جدول الدوام — الشفتات: A (06-14) / B (14-22) / C (22-06)",
    noDept: "بدون قسم",
    totalHours: "ساعة إجمالي",

    // Department
    addDepartment: "إضافة قسم جديد",
    departmentCount: "الأقسام ({count})",
    noDepartments: "لا يوجد أقسام بعد",
    addDeptHint: "أضف قسم جديد للبدء",
    deptEmployeeCount: "{count} موظف",
    deptPlaceholder: "اسم القسم...",
    saveBtn: "حفظ",
    cancelBtn: "إلغاء",
    deleteDept: "حذف القسم",
    confirmDeleteDept: "هل أنت متأكد من حذف جميع موظفي قسم {dept}؟",
    confirmClearDept: "هل أنت متأكد من مسح جميع موظفي قسم {dept}؟",

    // Grid View
    shiftSettings: "إعدادات أوقات الشفتات",
    resetShifts: "إعادة تعيين",
    hideSettings: "إخفاء",
    uploadFile: "رفع ملف",
    uploadScheduleImage: "رفع صورة جدول",
    analyzingOcr: "جاري التحليل...",
    addEmployee: "إضافة موظف",
    exportImage: "صورة",
    exportScheduleExcel: "صورة",
    leaveLabel: "إجازة",
    clearAllEmployees: "مسح كل الموظفين",
    searchPlaceholder: "بحث بالاسم...",
    addDeptTo: "إضافة موظف لقسم: {dept}",
    noEmployees: "لا يوجد موظفين في هذا القسم",
    noEmployeesHint: "ارفع ملف أو صورة أو أضف موظفين يدوياً",
    confirmDeleteEmployee: "هل أنت متأكد من حذف هذا الموظف؟",

    // Grid Table
    colEmployee: "الموظف",
    colHours: "الساعات",
    shiftPickerLabel: "اختر:",
    leaveTypeLabel: "نوع الإجازة:",
    deleteBtn: "حذف",

    // Leave Types
    leaveAnnual: "إجازة سنوية",
    leaveSick: "إجازة مرضية",
    leaveEmergency: "إجازة طارئة",
    leaveUnpaid: "إجازة بدون راتب",
    leaveMaternity: "إجازة أمومة",
    leaveHajj: "إجازة حج",
    leaveBereavement: "إجازة عزاء",
    leaveOfficial: "إجازة رسمية",
    leaveMission: "مهمة رسمية",

    // OCR
    ocrReading: "جاري قراءة الصورة...",
    ocrAnalyzing: "جاري تحليل الصورة بالذكاء الاصطناعي...",
    ocrNoData: "لم يتم العثور على بيانات في الصورة",
    ocrExtracted: "تم استخراج جدول {count} موظف من الصورة",
    ocrNoValid: "لم يتم استخراج بيانات صالحة من الصورة",
    ocrError: "خطأ في ق读ة الصورة: {error}",
    ocrUnknownError: "خطأ غير معروف",

    // Import
    importFound: "تم العثور على {count} موظف. هل تريد إضافتهم？",
    importFileEmpty: "الملف فارغ",
    importNoValid: "لم يتم العثور على بيانات صالحة",
    importEmpty: "الملف فارغ",

    // Export
    exportError: "حدث خطأ أثناء التصدير",
    sheetName: "جدول الدوام",
    filePrefix: "جدول_الدوام_",
    excelColEmployee: "الموظف",
    excelColHours: "الساعات",

    // Shift Names
    shiftA: "A",
    shiftB: "B",
    shiftC: "C",

    // ==================== OvertimeTracker ====================
    // Main
    overtimeTitle: "سجل العمل الإضافي والخصومات",
    overtimeSubtitle: "تسجيل ساعات العمل الإضافي والخصومات — كل 8 ساعات = يوم",
    importCsvExcel: "استيراد CSV / Excel",
    changePassword: "تغيير الباسورد",

    // Summary Cards
    employeesCount: "الموظفين",
    employeesCountUnit: "شخص",
    overtimeHours: "عمل إضافي",
    deductions: "الخصومات",
    netHours: "الصافي",
    dayUnit: "يوم",

    // Progress
    progressTitle: "تقدم تحويل الساعات لأيام (صافي)",
    hoursUnit: "ساعات",

    // Per-Employee Summary
    perEmployeeSummary: "ملخص كل موظف",
    overtimeShort: "إضافي: {value} س",
    deductionShort: "خصومات: {value} س",
    netShort: "صافي: {value} س",
    recordsCount: "{count} سجل",

    // Add Entry Form
    addNewEntry: "إضافة سجل جديد",
    addMode: "إضافة",
    deductionMode: "خصم",
    employeeNameLabel: "اسم الموظف",
    employeeNamePlaceholder: "اسم الموظف",
    dateLabel: "التاريخ",
    hoursLabel: "عدد الساعات",
    hoursPlaceholder: "مثال: 2.5",
    deductionReasonLabel: "سبب الخصم",
    deductionReasonPlaceholder: "مغادرة / إجازة / سبب حر",
    notesOptional: "ملاحظات (اختياري)",
    notesPlaceholder: "مثال: إكمال مشروع",
    reasonPreset1: "مغادرة",
    reasonPreset2: "إجازة",
    reasonPreset3: "سبب حر",
    viewerCantAdd: "المشاهدون لا يمكنهم الإضافة",
    registerDeduction: "تسجيل الخصم",
    addEntry: "إضافة السجل",

    // Validation
    errNameRequired: "يرجى إدخال اسم الموظف",
    errDateRequired: "يرجى اختيار التاريخ",
    errHoursRequired: "يرجى إدخال عدد ساعات صحيح",
    errHoursMax: "لا يمكن أن تتجاوز الساعات 24 ساعة يومياً",
    errDeductionReason: "يرجى إدخال سبب الخصم",
    errPasswordWrong: "الباسورد غير صحيح",

    // Entries Table
    recordsTitle: "ال_records",
    recordsOf: "من",
    searchNamePlaceholder: "بحث بالاسم...",
    exportPdfTitle: "تصدير PDF",
    exportExcelTitle: "تصدير Excel",
    clearAllBtn: "مسح الكل",
    dateFilter: "فلتر بالتاريخ:",
    clearFilter: "مسح الفلتر",
    noRecords: "لا توجد سجلات عمل إضافي",
    noResults: "لا توجد نتائج مطابقة للبحث",
    noRecordsHint: "أضف سجلات باستخدام النموذج أعلاه",
    noResultsHint: "جرّب تغيير كلمة البحث",
    colNotes: "السبب / ملاحظات",
    typeDeduction: "خصم",
    typeOvertime: "إضافة",
    hourUnit: "ساعة",
    deleteRecord: "حذف السجل",
    totalOvertime: "الإجمالي: إضافي {ot} س | خصومات {ded} س",
    totalNet: "صافي: {net} ساعة",
    totalDays: "{count} يوم",

    // Confirm Dialogs
    confirmDeleteRecords: "هل أنت متأكد من حذف جميع س_records {name}؟",
    confirmDeleteAll: "هل أنت متأكد من حذف جميع سجلات العمل الإضافي لجميع الموظفين؟",

    // CSV Export Headers
    csvColEmployee: "الموظف",
    csvColDate: "التاريخ",
    csvColDay: "اليوم",
    csvColType: "النوع",
    csvColHours: "الساعات",
    csvColReason: "السبب",
    csvColNotes: "ملاحظات",
    csvTypeDeduction: "خصم",
    csvTypeOvertime: "عمل إضافي",
    csvFilePrefix: "سجل_العمل_الاضافي_",

    // Import
    importEmptyFile: "الملف فارغ أو لا يحتوي على بيانات",
    importRowError: "سطر {i}: أعمدة غير كافية",
    importRowIncomplete: "سطر {i}: بيانات ناقصة",
    importRowBadHours: "سطر {i}: ساعات غير صالحة ({hours})",
    importFoundRecords: "تم العثور على {count} سجل صالح. هل تريد إضافتها؟",
    importErrors: "أخطاء في الاستيراد:\n",

    // Password Modal
    passwordConfirmDelete: "تأكيد الحذف",
    passwordConfirmImport: "تأكيد الاستيراد",
    passwordConfirmDeduction: "تأكيد الخصم",
    passwordConfirmAdd: "تأكيد الإضافة",
    passwordDeleteDesc: "أدخل الباسورد لتأكيد حذف هذا السجل",
    passwordImportDesc: "أدخل الباسورد لاستيراد {count} سجل",
    passwordDeductionDesc: "أدخل الباسورد لتسجيل الخصم",
    passwordAddDesc: "أدخل الباسورد لتسجيل سجل العمل الإضافي",
    passwordPlaceholder: "أدخل الباسورد",
    confirmImport: "استيراد",
    confirmDeduction: "خصم",
    confirmAdd: "إضافة",

    // Change Password
    changePasswordTitle: "تغيير الباسورد",
    passwordChangedSuccess: "تم تغيير الباسورد بنجاح!",
    oldPasswordPlaceholder: "الباسورد القديم",
    newPasswordPlaceholder: "الباسورد الجديد",
    changeBtn: "تغيير",
    changeFailed: "فشل تغيير الباسورد",

    // PDF Export
    pdfTitle: "سجل العمل الإضافي والخصومات",
    pdfExportDate: "تاريخ التصدير: {date}",
    pdfEmployeeFilter: "الموظف: {name}",
    pdfDateRange: "من {from} إلى {to}",
    pdfSummary: "عمل إضافي: {ot} س | خصومات: {ded} س | صافي: {net} س = {days} يوم | عدد السجلات: {count}",
    pdfPage: "صفحة {num}",

    // Schedule Comparison
    scheduleComparison: "مقارنة الجدول بالبصمات",
    scheduleComparisonDesc: "مقارنة جدول الدوام مع سجلات الحضور الفعلية",
    noScheduleData: "لا يوجد جدول دوام محفوظ للمقارنة",
    noFingerprintData: "لا يوجد تقرير حضور محفوظ للمقارنة",
    violationsFound: "تم اكتشاف {count} مخالفة",
    noViolations: "لا توجد مخالفات — التزام تام",
    violationLate: "تأخير عن الدوام",
    violationEarly: "خروج مبكر",
    violationAbsence: "غياب",
    violationUnscheduled: "حضور بدون جدول",
    violationNoCheckout: "بدون خروج مسجل",
    expectedTime: "المتوقع: {time}",
    actualTime: "الفعلي: {time}",
    delayMinutes: "تأخير {minutes} دقيقة",
    compareScheduleBtn: "مقارنة الجدول بالبصمات",
  },

  en: {
    // App-wide
    appTitle: "Smart Timesheet Analyzer",
    appSubtitle: "Automated Arabic attendance screenshot analysis with AI",
    skipToContent: "Skip to content",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    close: "Close",
    confirm: "Confirm",
    search: "Search",
    loading: "Loading...",
    edit: "Edit",
    add: "Add",
    remove: "Remove",
    clear: "Clear",
    hours: "hours",
    hour: "hour",
    hoursShort: "h",
    days: "days",
    day: "day",
    minutes: "minutes",
    minute: "minute",
    minuteShort: "min",
    employees: "Employees",
    employee: "Employee",
    employeeName: "Employee name",
    total: "Total",
    name: "Name",
    type: "Type",
    date: "Date",
    notes: "Notes",
    reason: "Reason",
    images: "images",
    singleImage: "image",
    yes: "Yes",
    no: "No",
    of: "of",
    from: "From",
    to: "To",

    // Header & Navigation
    tabReport: "Report",
    tabSchedule: "Schedule",
    tabOvertime: "Overtime",
    adminLogin: "Admin Login",
    adminLoginDesc: "Enter admin password for full access",
    adminPasswordPlaceholder: "Admin password",
    wrongPassword: "Wrong password",
    login: "Login",
    guideTitle: "Guide",

    // Admin
    adminTitle: "Admin Panel",
    adminDesc: "View and manage all saved reports",
    totalReports: "Total Reports",
    totalEmployees: "Total Employees",
    avgCompliance: "Avg Compliance Rate",
    recentReports: "Recent Reports",
    noAdminData: "No saved reports in the system.",
    viewReport: "View Report",
    deleteReportAdmin: "Delete",
    backToMain: "Back to main",

    // Upload
    uploadTitle: "Upload Timesheet",
    uploadDesc: "Drag & drop an Arabic attendance screenshot or browse your files",
    uploadMultiDesc: "Drag & drop screenshots or browse — multiple files supported",
    dragDrop: "Drop your screenshot here",
    dragDropHint: "Supports PNG, JPG, JPEG images",
    dragDropMultiHint: "PNG, JPG, JPEG — multiple images supported",
    chooseFile: "Choose file",
    removeImage: "Remove image",
    changeImage: "Change image",
    uploadedTimesheet: "Uploaded timesheet",
    analyzeImageCount: "Analyze {count} images now",

    // Work Policies / Time
    workPolicies: "Work Policies",
    officialWorkHours: "Official Work Hours",
    startTime: "Start time:",
    endTime: "End time:",
    startLabel: "Start",
    endLabel: "End",
    timeHint: "Select official analysis times (30-min intervals)",

    // Analyze
    analyze: "Analyze screenshot now",
    analyzing: "Processing and reading timesheet...",
    noImageError: "Please upload a timesheet screenshot first.",
    fileTypeError: "Please select a valid image file (PNG, JPEG, JPG).",
    compressionError: "Error compressing image:",
    viewerCantAnalyze: "Viewers cannot analyze",

    // History / Saved Reports
    history: "Saved Records",
    savedReports: "Saved Reports",
    noReports: "No saved reports.",
    clearAll: "Clear all",
    deleteReport: "Delete this report",
    confirmDeleteHistory: "Are you sure you want to delete all saved reports?",
    numberLabel: "No:",
    delayBadge: "Delay:",
    absenceBadge: "Absence:",

    // Empty State
    emptyState: "Waiting for timesheet upload",
    emptyStateDesc: "Upload a timesheet screenshot from your HR system to automatically extract attendance reports using AI.",

    // Employee Card
    employeeInfo: "Employee Information",
    employeeId: "Employee ID",
    jobTitle: "Job Title",
    workPeriod: "Official Work Period",
    notAvailable: "N/A",
    print: "Print",
    exportPDF: "PDF",
    exportExcel: "Excel",
    showJson: "JSON",
    hideJson: "Hide",

    // KPIs
    attendanceRate: "Correct Attendance Rate",
    attendanceRateDesc: "Days without violations",
    delayEarlyOut: "Delays & Early Exits",
    delayEarlyOutDesc: "Total delay and early exit minutes",
    absences: "Unexcused Absences",
    absencesDesc: "Working days without attendance records",
    leavesUsed: "Leaves Used",
    leavesUsedDesc: "Total official leave days",
    workHours: "Actual Work Hours",
    workHoursDesc: "Total calculated work hours",
    duplicateFp: "Duplicate Fingerprints",
    duplicateFpDesc: "Duplicate check-in/out records",

    // Charts
    attendanceDistribution: "Attendance Distribution",
    chartTitle: "Daily Delay & Early Exit Trend",
    chartDesc: "Unexcused delay and early exit minutes",
    chartDayLabel: "Day {value}",
    chartMinuteUnit: "{value} min",
    tooltipMinute: "{value} minutes",

    // Late & Early Summary
    lateSummary: "Late & Early Exit Summary",
    lateSummaryAuto: "Auto analysis with permission linking",
    perfectRecord: "Excellent record!",
    perfectRecordDesc: "Employee is fully compliant with no late days or unexcused early exits.",
    lateDaysCount: "Late days ({count}):",
    earlyOutDays: "Early exit & permission days:",
    noLate: "No late days.",
    noEarlyOut: "No early exits.",
    checkInLabel: "In:",
    checkOutLabel: "Out:",

    // Duplicate Fingerprints
    duplicateFpAlert: "Alert: Duplicate fingerprints detected",
    duplicateFpRisk: "Risk",
    duplicateFpDesc2: "Duplicate check-in/out detected on some days.",
    duplicateFpDays: "Duplicate fingerprints ({count} days)",
    alertBadge: "Alert",

    // Leave / Permission Tags
    leaveTaken: "Leave taken",
    permissionTaken: "Permission taken",
    multipleCheckIns: "{count} check-ins",
    multipleCheckOuts: "{count} check-outs",
    officialLeave: "Official Leave",
    leaveTypePlaceholder: "Leave type (sick, annual...)",
    approvedPermission: "Approved permission",
    saveEdits: "Save edits",
    editManually: "Edit record manually",
    editing: "Editing...",
    clearToSetAbsence: "Clear to set absence/leave",

    // Filters
    all: "All",
    violations: "Violations",
    leavesFilter: "Leaves",
    regular: "Regular",
    tableDayDate: "Day & Date",
    tableCheckIn: "Check In",
    tableCheckOut: "Check Out",
    tableWorkHours: "Work Hours",
    tableStatus: "Compliance Status",
    tableNotes: "Analysis Notes",
    tableEdit: "Edit",
    tableNoData: "No days match the selected filter.",
    tableFooter: "All data has been normalized (Eastern/Western numerals).",
    tableTotalDays: "Total days: {count} day",

    // Table Status
    statusWeekend: "Weekend",
    statusRegular: "Regular attendance",
    statusLateExcused: "Excused late (permission)",
    statusLateUnexcused: "Unexcused late",
    statusEarlyOut: "Early exit",
    statusNoEntry: "No check-in",
    statusNoExit: "No check-out",
    statusAbsence: "Unexcused absence",
    statusLeaveOfficial: "Official leave ({type})",
    noteExcusedPermission: "Official approved permission.",
    noteLateUnexcused: "Unexcused late.",
    noteEarlyOut: "Unexcused early exit.",
    noteNoEntry: "No check-in recorded.",
    noteNoExit: "No check-out recorded.",
    noteLeaveCovered: "Covered by leave: {type}",
    noteAbsence: "No attendance or departure records found",
    noteOnTime: "On time",
    statusExplainWeekend: "Official weekend.\nNot counted as working day, no violations recorded.",
    statusExplainLeave: "Official leave ({type}).\nEmployee is fully exempt from recording movements this day.",
    statusExplainAbsence: "Unexcused absence.\nNo attendance (check-in) or departure (check-out) movements recorded.",
    statusExplainLate: "• Late: Attendance recorded at {time}, which is {minutes} minutes after official start {official}.",
    statusExplainPermission: "• Excused late: Late attendance recorded with an approved leave permission.",
    statusExplainOnTime: "• On time: Attendance recorded at {time}, before or at official start {official}.",
    statusExplainNoEntry: "• No check-in: No attendance movement recorded.",
    statusExplainEarlyOut: "• Early exit: Departure recorded at {time}, which is {minutes} minutes before official end {official}.",
    statusExplainOnTimeExit: "• On time exit: Departure recorded at {time}, at or after official end {official}.",
    statusExplainNoExit: "• No check-out: No official departure movement recorded.",
    systemRuleTitle: "System Rule Calculation",
    systemRuleTransparency: "Analysis Transparency",

    // JSON Debug
    extractedDataJson: "Raw Extracted Data",
    downloadJson: "Download JSON",

    // Detailed Report
    detailedReport: "Detailed Report",
    reportSubtitle: "Days table with detailed analysis",

    // How It Works
    howItWorks: "How does the Timesheet Analyzer work?",
    step1Title: "1. Visual Reading (OCR)",
    step1Desc: "Gemini AI analyzes the screenshot and extracts attendance, permissions, and leave tables.",
    step2Title: "2. Data Normalization",
    step2Desc: "Eastern Arabic numerals are converted to Western, and dates/durations are normalized for safe comparison.",
    step3Title: "3. Rule Application",
    step3Desc: "Arrival time is compared to official hours. If late, the permissions table is checked. Otherwise logged as delay.",

    // Footer
    footer: "Automated Arabic Timesheet Analysis",
    footerCopyright: "Timesheet Analyzer ©",

    // Dark mode
    darkMode: "Dark Mode",
    lightMode: "Light Mode",
    switchLang: "العربية",

    // Comparison & Trends (legacy)
    compareTitle: "Employee Comparison",
    compareDesc: "Compare attendance reports of multiple employees side by side",
    addReport: "Add report to compare",
    noReportsToCompare: "No saved reports to compare.",
    trendsTitle: "Monthly Trends",
    trendsDesc: "Track attendance patterns across multiple months",
    month: "Month",
    avgDelay: "Avg delay (min)",
    totalAbsencesTrend: "Total absences",
    complianceRate: "Compliance rate",
    noTrendsData: "Not enough data for trends.",
    policiesTitle: "Custom Work Policies",
    gracePeriod: "Grace period (minutes)",
    gracePeriodDesc: "Extra minutes after official start allowed without marking late",
    overtimeThreshold: "Overtime threshold (hours)",
    overtimeThresholdDesc: "Hours beyond official end counted as overtime",
    maxDelaysAllowed: "Max monthly delays allowed",
    maxDelaysAllowedDesc: "Number of allowed late arrivals per month",
    savePolicies: "Save policies",
    policiesSaved: "Policies saved successfully!",

    // ==================== ScheduleManager ====================
    scheduleTitle: "Schedule",
    scheduleDesc: "Select a department to view the schedule — Shifts: A (06-14) / B (14-22) / C (22-06)",
    noDept: "No Department",
    totalHours: "hours total",

    addDepartment: "Add New Department",
    departmentCount: "Departments ({count})",
    noDepartments: "No departments yet",
    addDeptHint: "Add a new department to get started",
    deptEmployeeCount: "{count} employees",
    deptPlaceholder: "Department name...",
    saveBtn: "Save",
    cancelBtn: "Cancel",
    deleteDept: "Delete Department",
    confirmDeleteDept: "Are you sure you want to delete all employees in {dept}?",
    confirmClearDept: "Are you sure you want to clear all employees in {dept}?",

    shiftSettings: "Shift Time Settings",
    resetShifts: "Reset",
    hideSettings: "Hide",
    uploadFile: "Upload File",
    uploadScheduleImage: "Upload Schedule Image",
    analyzingOcr: "Analyzing...",
    addEmployee: "Add Employee",
    exportImage: "Image",
    exportScheduleExcel: "Image",
    leaveLabel: "Leave",
    clearAllEmployees: "Clear All Employees",
    searchPlaceholder: "Search by name...",
    addDeptTo: "Add Employee to: {dept}",
    noEmployees: "No employees in this department",
    noEmployeesHint: "Upload a file, image, or add employees manually",
    confirmDeleteEmployee: "Are you sure you want to delete this employee?",

    colEmployee: "Employee",
    colHours: "Hours",
    shiftPickerLabel: "Select:",
    leaveTypeLabel: "Leave type:",
    deleteBtn: "Delete",

    leaveAnnual: "Annual leave",
    leaveSick: "Sick leave",
    leaveEmergency: "Emergency leave",
    leaveUnpaid: "Unpaid leave",
    leaveMaternity: "Maternity leave",
    leaveHajj: "Hajj leave",
    leaveBereavement: "Bereavement leave",
    leaveOfficial: "Official holiday",
    leaveMission: "Official mission",

    ocrReading: "Reading image...",
    ocrAnalyzing: "Analyzing image with AI...",
    ocrNoData: "No data found in image",
    ocrExtracted: "Extracted schedule for {count} employees",
    ocrNoValid: "No valid data extracted from image",
    ocrError: "Error reading image: {error}",
    ocrUnknownError: "Unknown error",

    importFound: "Found {count} employees. Add them?",
    importFileEmpty: "File is empty",
    importNoValid: "No valid data found",
    importEmpty: "File is empty",

    exportError: "Export error occurred",
    sheetName: "Schedule",
    filePrefix: "Schedule_",
    excelColEmployee: "Employee",
    excelColHours: "Hours",

    shiftA: "A",
    shiftB: "B",
    shiftC: "C",

    // ==================== OvertimeTracker ====================
    overtimeTitle: "Overtime & Deductions Log",
    overtimeSubtitle: "Track overtime and deduction hours — every 8 hours = 1 day",
    importCsvExcel: "Import CSV / Excel",
    changePassword: "Change Password",

    employeesCount: "Employees",
    employeesCountUnit: "people",
    overtimeHours: "Overtime",
    deductions: "Deductions",
    netHours: "Net",
    dayUnit: "day",

    progressTitle: "Hours to Days Conversion Progress (Net)",
    hoursUnit: "hours",

    perEmployeeSummary: "Per-Employee Summary",
    overtimeShort: "OT: {value} h",
    deductionShort: "Ded: {value} h",
    netShort: "Net: {value} h",
    recordsCount: "{count} records",

    addNewEntry: "Add New Entry",
    addMode: "Add",
    deductionMode: "Deduction",
    employeeNameLabel: "Employee Name",
    employeeNamePlaceholder: "Employee name",
    dateLabel: "Date",
    hoursLabel: "Number of Hours",
    hoursPlaceholder: "e.g. 2.5",
    deductionReasonLabel: "Deduction Reason",
    deductionReasonPlaceholder: "Leave / Absence / Other",
    notesOptional: "Notes (optional)",
    notesPlaceholder: "e.g. Project completion",
    reasonPreset1: "Absence",
    reasonPreset2: "Leave",
    reasonPreset3: "Other",
    viewerCantAdd: "Viewers cannot add entries",
    registerDeduction: "Register Deduction",
    addEntry: "Add Entry",

    errNameRequired: "Please enter employee name",
    errDateRequired: "Please select a date",
    errHoursRequired: "Please enter valid hours",
    errHoursMax: "Hours cannot exceed 24 per day",
    errDeductionReason: "Please enter deduction reason",
    errPasswordWrong: "Wrong password",

    recordsTitle: "Records",
    recordsOf: "of",
    searchNamePlaceholder: "Search by name...",
    exportPdfTitle: "Export PDF",
    exportExcelTitle: "Export Excel",
    clearAllBtn: "Clear All",
    dateFilter: "Date filter:",
    clearFilter: "Clear filter",
    noRecords: "No overtime records",
    noResults: "No matching results",
    noRecordsHint: "Add entries using the form above",
    noResultsHint: "Try changing the search term",
    colNotes: "Reason / Notes",
    typeDeduction: "Deduction",
    typeOvertime: "Overtime",
    hourUnit: "hour",
    deleteRecord: "Delete record",
    totalOvertime: "Total: OT {ot} h | Deductions {ded} h",
    totalNet: "Net: {net} hours",
    totalDays: "{count} days",

    confirmDeleteRecords: "Are you sure you want to delete all records for {name}?",
    confirmDeleteAll: "Are you sure you want to delete all overtime records?",

    csvColEmployee: "Employee",
    csvColDate: "Date",
    csvColDay: "Day",
    csvColType: "Type",
    csvColHours: "Hours",
    csvColReason: "Reason",
    csvColNotes: "Notes",
    csvTypeDeduction: "Deduction",
    csvTypeOvertime: "Overtime",
    csvFilePrefix: "Overtime_",

    importEmptyFile: "File is empty or contains no data",
    importRowError: "Row {i}: Insufficient columns",
    importRowIncomplete: "Row {i}: Incomplete data",
    importRowBadHours: "Row {i}: Invalid hours ({hours})",
    importFoundRecords: "Found {count} valid records. Add them?",
    importErrors: "Import errors:\n",

    passwordConfirmDelete: "Confirm Delete",
    passwordConfirmImport: "Confirm Import",
    passwordConfirmDeduction: "Confirm Deduction",
    passwordConfirmAdd: "Confirm Add",
    passwordDeleteDesc: "Enter password to confirm deleting this record",
    passwordImportDesc: "Enter password to import {count} records",
    passwordDeductionDesc: "Enter password to register deduction",
    passwordAddDesc: "Enter password to register overtime entry",
    passwordPlaceholder: "Enter password",
    confirmImport: "Import",
    confirmDeduction: "Deduction",
    confirmAdd: "Add",

    changePasswordTitle: "Change Password",
    passwordChangedSuccess: "Password changed successfully!",
    oldPasswordPlaceholder: "Old password",
    newPasswordPlaceholder: "New password",
    changeBtn: "Change",
    changeFailed: "Failed to change password",

    pdfTitle: "Overtime & Deductions Log",
    pdfExportDate: "Export date: {date}",
    pdfEmployeeFilter: "Employee: {name}",
    pdfDateRange: "From {from} to {to}",
    pdfSummary: "OT: {ot} h | Deductions: {ded} h | Net: {net} h = {days} days | Records: {count}",
    pdfPage: "Page {num}",

    // Schedule Comparison
    scheduleComparison: "Schedule vs Fingerprint Comparison",
    scheduleComparisonDesc: "Compare the work schedule with actual attendance records",
    noScheduleData: "No saved schedule for comparison",
    noFingerprintData: "No saved attendance report for comparison",
    violationsFound: "{count} violations found",
    noViolations: "No violations — full compliance",
    violationLate: "Late arrival",
    violationEarly: "Early departure",
    violationAbsence: "Absence",
    violationUnscheduled: "Unscheduled attendance",
    violationNoCheckout: "No checkout recorded",
    expectedTime: "Expected: {time}",
    actualTime: "Actual: {time}",
    delayMinutes: "{minutes} minutes late",
    compareScheduleBtn: "Compare Schedule vs Fingerprints",
  },
};

const LanguageContext = createContext<LangContextType>({
  lang: "ar",
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return (localStorage.getItem("app_lang") as Lang) || "ar";
    } catch {
      return "ar";
    }
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("app_lang", l); } catch {}
    document.documentElement.lang = l;
    document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const t = (key: string, vars?: Record<string, string | number>): string => {
    let str = translations[lang]?.[key] || translations.ar[key] || key;
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      });
    }
    return str;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}
