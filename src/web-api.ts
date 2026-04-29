async function parseResponse(response: Response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.detail || data.error || response.statusText || "请求失败");
  }
  return data;
}

async function postJson(path: string, payload?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload || {}),
  });
  return parseResponse(response);
}

function selectFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt";
    input.style.display = "none";
    input.onchange = () => {
      resolve(Array.from(input.files || []));
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}

function selectSingleFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    function finish(file: File | null) {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", handleFocus);
      input.remove();
      resolve(file);
    }
    function handleFocus() {
      window.setTimeout(() => {
        if (!input.files?.length) finish(null);
      }, 300);
    }
    input.onchange = () => {
      finish(input.files?.[0] || null);
    };
    input.addEventListener("cancel", () => finish(null));
    window.addEventListener("focus", handleFocus);
    document.body.appendChild(input);
    input.click();
  });
}

async function uploadFilesToTemp(files: File[]) {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  const response = await fetch("/api/upload-temp", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const result = await parseResponse(response);
  return result.paths || [];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

window.lawyerAPI = {
  platform: "web",

  async authMe() {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    return parseResponse(response);
  },

  async login(payload: { username: string; password: string }) {
    return postJson("/api/auth/login", payload);
  },

  async register(payload: { username: string; fullName: string; position: string; password: string; inviteCode: string }) {
    return postJson("/api/auth/register", payload);
  },

  async logout() {
    return postJson("/api/auth/logout", {});
  },

  async businessLogs() {
    const response = await fetch("/api/business-logs", { credentials: "include" });
    return parseResponse(response);
  },

  async listUsers() {
    const response = await fetch("/api/users", { credentials: "include" });
    return parseResponse(response);
  },

  async updateUser(userId: string, payload: { active?: boolean; password?: string }) {
    return postJson(`/api/users/${encodeURIComponent(userId)}`, payload);
  },

  async getInviteCode() {
    const response = await fetch("/api/admin/invite-code", { credentials: "include" });
    return parseResponse(response);
  },

  async resetInviteCode() {
    return postJson("/api/admin/invite-code/reset", {});
  },

  async uploadDatabase() {
    const file = await selectSingleFile(".db,.sqlite,.sqlite3");
    if (!file) return { ok: false, canceled: true };
    const form = new FormData();
    form.append("database", file);
    const response = await fetch("/api/import-database", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    return parseResponse(response);
  },

  async call(command: string, payload?: any) {
    if (command === "exportExcel") {
      const response = await fetch("/api/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          defaultName: payload?.outputPath || "案件进度表.xlsx",
          scope: payload?.scope || { mode: "all" },
        }),
      });
      if (!response.ok) {
        await parseResponse(response);
      }
      const blob = await response.blob();
      const filename = payload?.outputPath || "案件进度表.xlsx";
      downloadBlob(blob, filename);
      return {
        ok: true,
        count: Number(response.headers.get("X-Export-Count") || 0),
        path: "已下载到浏览器默认下载目录",
      };
    }
    const response = await fetch(`/api/call/${encodeURIComponent(command)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload || {}),
    });
    return parseResponse(response);
  },

  async chooseFiles() {
    const files = await selectFiles();
    if (!files.length) return [];
    return uploadFilesToTemp(files);
  },

  async chooseDirectory() {
    return window.prompt("请输入服务器目录路径，例如 /opt/lawyer-case-assistant/data/backups", "") || "";
  },

  async chooseSavePath(defaultName?: string) {
    return defaultName || "案件进度表.xlsx";
  },

  async openInFolder(path: string) {
    if (!path) return;
    window.open(`/api/download-file?path=${encodeURIComponent(path)}`, "_blank", "noopener,noreferrer");
  },
};
