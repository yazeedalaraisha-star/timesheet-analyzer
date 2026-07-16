import { SavedReport, EmployeeLeaveBalance, OvertimeEntry, EmployeeSchedule } from "./types";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const resp = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

export async function checkDBStatus(): Promise<boolean> {
  const data = await apiFetch<{ connected: boolean }>("/api/db-status");
  return data?.connected ?? false;
}

export async function fetchReports(): Promise<SavedReport[]> {
  const data = await apiFetch<SavedReport[]>("/api/reports");
  return data ?? [];
}

export async function saveReportToDB(report: SavedReport): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>("/api/reports", {
    method: "POST",
    body: JSON.stringify(report),
  });
  return data?.ok ?? false;
}

export async function deleteReportFromDB(id: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/reports/${id}`, {
    method: "DELETE",
  });
  return data?.ok ?? false;
}

export async function clearAllReportsFromDB(): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>("/api/reports", {
    method: "DELETE",
  });
  return data?.ok ?? false;
}

export async function fetchLeaveBalances(): Promise<EmployeeLeaveBalance[]> {
  const data = await apiFetch<EmployeeLeaveBalance[]>("/api/leave-balances");
  return data ?? [];
}

export async function saveLeaveBalancesToDB(balances: EmployeeLeaveBalance[]): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>("/api/leave-balances", {
    method: "POST",
    body: JSON.stringify(balances),
  });
  return data?.ok ?? false;
}

export async function fetchPoliciesFromDB(): Promise<any> {
  const data = await apiFetch<any>("/api/policies");
  return data ?? null;
}

export async function savePoliciesToDB(policies: any): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>("/api/policies", {
    method: "POST",
    body: JSON.stringify(policies),
  });
  return data?.ok ?? false;
}

export async function fetchOvertimeFromDB(): Promise<OvertimeEntry[]> {
  const data = await apiFetch<OvertimeEntry[]>("/api/overtime");
  return data ?? [];
}

export async function saveOvertimeToDB(entries: OvertimeEntry[]): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>("/api/overtime", {
    method: "POST",
    body: JSON.stringify(entries),
  });
  return data?.ok ?? false;
}

export async function verifyPassword(password: string): Promise<boolean> {
  const data = await apiFetch<{ valid: boolean }>("/api/verify-password", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  return data?.valid ?? false;
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const data = await apiFetch<{ ok: boolean; error?: string }>("/api/change-password", {
    method: "POST",
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  return data ?? { ok: false, error: "فشل الاتصال" };
}

export async function fetchSchedulesFromDB(): Promise<EmployeeSchedule[]> {
  const data = await apiFetch<EmployeeSchedule[]>("/api/schedules");
  return data ?? [];
}

export async function saveSchedulesToDB(schedules: EmployeeSchedule[]): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>("/api/schedules", {
    method: "POST",
    body: JSON.stringify(schedules),
  });
  return data?.ok ?? false;
}
