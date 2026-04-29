import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

type FieldType = "text" | "long_text" | "date" | "money" | "number" | "select" | "multi_select" | "contact";

type CaseField = {
  id: string;
  field_key: string;
  label: string;
  field_type: FieldType;
  builtin: number;
  visible: number;
  active: number;
  sort_order: number;
  options_json: string;
};

type CaseRecord = {
  id?: string;
  [key: string]: any;
  custom_values?: Record<string, string>;
};

type EventRecord = {
  id?: string;
  case_id: string;
  event_date: string;
  direction: string;
  counterparty_type: string;
  counterparty_name: string;
  summary: string;
  deadline_text: string;
  deadline_date: string;
  source: string;
  ocr_text: string;
};

type Deadline = {
  id: string;
  case_id: string;
  event_id?: string;
  deadline_date: string;
  title: string;
  source: string;
  confirmed: number;
  remind_20?: number;
  remind_7?: number;
  remind_1?: number;
};

type DocumentRecord = {
  id: string;
  case_id: string;
  event_id?: string;
  original_path: string;
  stored_path: string;
  file_name: string;
  ocr_status: string;
  ocr_text?: string;
};

type OcrResult = {
  id: string;
  document_id: string;
  case_id: string;
  event_id?: string;
  engine: string;
  raw_text: string;
  extracted_json: string;
  status: string;
};

type ExportMapping = {
  column_key: string;
  column_label: string;
  source_type: string;
  field_key: string;
  enabled: number;
  sort_order: number;
};

type AppState = {
  dataDir: string;
  dbPath: string;
  settings: Record<string, string>;
  fields: CaseField[];
  cases: CaseRecord[];
  events: EventRecord[];
  documents: DocumentRecord[];
  deadlines: Deadline[];
  ocrResults: OcrResult[];
  exportMappings: ExportMapping[];
};

type AuthUser = {
  id: string;
  username: string;
  full_name: string;
  position: string;
  active?: number;
  is_admin?: boolean;
  created_at?: string;
};

type BusinessLog = {
  id: string;
  username: string;
  action: string;
  target_type: string;
  target_id: string;
  detail: string;
  ip: string;
  created_at: string;
};

const CORE_KEYS = [
  "sign_date",
  "case_category",
  "cause",
  "representation_stage",
  "client_name",
  "client_role",
  "opposing_party",
  "opposing_role",
  "court",
  "claim_amount",
  "attorney_fee",
  "related_case_numbers",
  "judge_contact",
  "todo_summary",
  "time_points",
  "manual_progress",
  "status",
  "remarks"
];

const CASE_STATUS_OPTIONS = [
  "财产保全",
  "待排庭",
  "待开庭",
  "待判决",
  "待执行",
  "等待判决",
  "调节完成",
  "恢复执行",
  "诉前调解",
  "已在网上立案",
  "已撤诉",
  "结案",
  "执行终本"
];

const CLOSED_STATUS_OPTIONS = ["已撤诉", "结案", "执行终本"];

function isClosedCase(status: string) {
  return CLOSED_STATUS_OPTIONS.includes(status);
}

const TAB_ITEMS = [
  ["dashboard", "仪表盘", "总览"],
  ["cases", "案件管理", "台账"],
  ["events", "任务管理", "事件"],
  ["eventDetails", "事件明细", "流水"],
  ["export", "导出管理", "Excel"],
  ["settings", "系统设置", "配置"],
  ["logs", "业务日志", "留痕"]
];

const SETTINGS_GROUPS = [
  ["lawyer_name", "律所名"],
  ["feishu_webhook_url", "飞书 Webhook URL"],
  ["feishu_webhook_secret", "飞书 Webhook 密钥"],
  ["llm_provider", "大模型 Provider"],
  ["llm_base_url", "大模型 Base URL"],
  ["llm_api_key", "大模型 API Key"],
  ["llm_model_name", "大模型 Model Name"],
  ["vlm_base_url", "VLM/vLLM OCR Base URL"],
  ["vlm_api_key", "VLM/vLLM OCR API Key"],
  ["vlm_model_name", "VLM/vLLM OCR Model Name"],
  ["local_ocr_enabled", "启用本地 OCR"],
  ["local_ocr_model_path", "本地 OCR 模型路径"],
  ["local_ocr_language", "本地 OCR 语言"],
  ["local_ocr_timeout_seconds", "本地 OCR 超时秒数"],
  ["tesseract_path", "Tesseract 可执行文件路径"],
  ["excel_template_path", "Excel 模板路径"],
  ["export_directory", "默认导出目录"],
  ["backup_directory", "本地备份目录"],
  ["backup_retention_count", "备份保留份数"],
  ["reminder_hour", "提醒小时"]
];

const BOOLEAN_SETTINGS = new Set(["local_ocr_enabled"]);

const emptyEvent: EventRecord = {
  case_id: "",
  event_date: new Date().toISOString().slice(0, 10),
  direction: "收到",
  counterparty_type: "法院",
  counterparty_name: "",
  summary: "",
  deadline_text: "",
  deadline_date: "",
  source: "manual",
  ocr_text: ""
};

function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function emptyCase(): CaseRecord {
  const item: CaseRecord = { custom_values: {}, status: "已在网上立案" };
  CORE_KEYS.forEach((key) => {
    item[key] = item[key] || "";
  });
  return item;
}

function parseOptions(field: CaseField) {
  if (field.field_key === "status") {
    return CASE_STATUS_OPTIONS;
  }
  try {
    return JSON.parse(field.options_json || "[]") as string[];
  } catch {
    return [];
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

function displayCaseTitle(item: CaseRecord) {
  const clientName = String(item.client_name || "").trim();
  const opposingParties = splitJoinedValue(String(item.opposing_party || "")).filter(Boolean);
  const firstOpposingParty = opposingParties[0] || "";
  if (clientName && firstOpposingParty) {
    return `${clientName} vs ${firstOpposingParty}${opposingParties.length > 1 ? "等" : ""}`;
  }
  return clientName || firstOpposingParty || item.cause || item.related_case_numbers || "未命名案件";
}

function latestEvent(events: EventRecord[], caseId?: string) {
  return events
    .filter((event) => event.case_id === caseId)
    .sort((a, b) => `${b.event_date}${b.id || ""}`.localeCompare(`${a.event_date}${a.id || ""}`))[0];
}

function nextDeadline(deadlines: Deadline[], caseId?: string) {
  const today = todayText();
  return deadlines
    .filter((deadline) => deadline.case_id === caseId && deadline.deadline_date >= today)
    .sort((a, b) => a.deadline_date.localeCompare(b.deadline_date))[0];
}

function DashboardView(props: {
  cases: CaseRecord[];
  events: EventRecord[];
  deadlines: Deadline[];
  setTab: (tab: string) => void;
  editCase: (item?: CaseRecord) => void;
  setSelectedCaseId: (value: string) => void;
}) {
  const activeCount = props.cases.filter((item) => !isClosedCase(item.status || "")).length;
  const closedCount = props.cases.filter((item) => isClosedCase(item.status || "")).length;
  const pendingDeadlines = props.deadlines.filter((item) => !item.confirmed).length;
  const confirmedUpcoming = props.deadlines.filter((item) => item.confirmed && item.deadline_date >= todayText()).length;
  const statusCounts = CASE_STATUS_OPTIONS.map((status) => ({
    status,
    count: props.cases.filter((item) => item.status === status).length
  })).filter((item) => item.count);
  const orderedCases = [...props.cases].sort((left, right) =>
    (left.sign_date || left.created_at || "").localeCompare(right.sign_date || right.created_at || "")
  );

  function openCase(item: CaseRecord) {
    props.setSelectedCaseId(item.id || "");
    props.editCase(item);
    props.setTab("cases");
  }

  function caseEvents(caseId?: string) {
    return props.events
      .filter((event) => event.case_id === caseId)
      .sort((left, right) => {
        const byDate = (left.event_date || "").localeCompare(right.event_date || "");
        if (byDate !== 0) return byDate;
        return (left.id || "").localeCompare(right.id || "");
      });
  }

  return (
    <div className="stack dashboard-shell">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">MISSION CONTROL</span>
          <h2>案件进度控制台</h2>
          <p>把案件台账、往来事件、期限提醒和 OCR 识别结果收拢到同一个工作台。</p>
          <div className="hero-actions">
            <button onClick={() => props.setTab("cases")}>进入案件管理</button>
            <button className="secondary" onClick={() => props.setTab("events")}>处理往来事件</button>
          </div>
        </div>
        <div className="metric-grid">
          <div className="metric active"><span>全部案件</span><strong>{props.cases.length}</strong><em>CASE LOAD</em></div>
          <div className="metric"><span>在办</span><strong>{activeCount}</strong><em>ACTIVE</em></div>
          <div className="metric"><span>办结</span><strong>{closedCount}</strong><em>CLOSED</em></div>
          <div className="metric"><span>待确认期限</span><strong>{pendingDeadlines}</strong><em>REVIEW</em></div>
          <div className="metric"><span>已确认待提醒</span><strong>{confirmedUpcoming}</strong><em>REMIND</em></div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel status-panel">
          <span className="eyebrow">CASE STATUS</span>
          <h3>状态分布</h3>
          <div className="status-chip-list">
            {statusCounts.map((item) => (
              <span className={CLOSED_STATUS_OPTIONS.includes(item.status) ? "status-chip closed" : "status-chip"} key={item.status}>
                {item.status}：{item.count}
              </span>
            ))}
            {!statusCounts.length && <span className="hint">暂无案件状态</span>}
          </div>
        </section>

        <section className="panel quick-panel">
          <span className="eyebrow">QUICK ACCESS</span>
          <h3>快速处理</h3>
          <button className="quick-row" onClick={() => props.setTab("events")}>
            <span className="quick-icon" />
            <span><strong>往来事件</strong><em>上传、OCR、生成期限</em></span>
            <i>›</i>
          </button>
          <button className="quick-row" onClick={() => props.setTab("export")}>
            <span className="quick-icon" />
            <span><strong>Excel 导出</strong><em>按模板生成进度表</em></span>
            <i>›</i>
          </button>
        </section>
      </div>

      <section className="panel mission-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">RECENT MISSIONS</span>
            <h3>案件往来事件面板</h3>
          </div>
          <button className="secondary" onClick={() => props.setTab("eventDetails")}>查看全部</button>
        </div>
        <div className="case-event-board">
          {orderedCases.map((item) => {
            const events = caseEvents(item.id);
            const deadline = nextDeadline(props.deadlines, item.id);
            return (
              <article className="case-event-card" key={item.id}>
                <div className="case-event-heading">
                  <button className="link-button" onClick={() => openCase(item)}>
                    <strong>{displayCaseTitle(item)}</strong>
                    <span>{item.related_case_numbers || item.court || "暂无案号/法院"}</span>
                  </button>
                  <em className={isClosedCase(item.status || "") ? "status-chip closed" : "status-chip"}>
                    {item.status || "未设状态"}
                  </em>
                </div>
                {events.length ? (
                  <ol className="event-sequence">
                    {events.map((event) => (
                      <li key={event.id}>
                        <time>{event.event_date || "未填日期"}</time>
                        <div>
                          <strong>{[event.direction, event.counterparty_type, event.counterparty_name].filter(Boolean).join(" ") || "事件"}</strong>
                          <p>{event.summary || "未填写摘要"}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="hint">暂无往来事件</p>
                )}
                <footer>{deadline ? `下一期限：${deadline.deadline_date} ${deadline.title}` : "暂无后续期限"}</footer>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AuthView(props: {
  onLogin: (payload: { username: string; password: string }) => Promise<void>;
  onRegister: (payload: { username: string; fullName: string; position: string; password: string; inviteCode: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [draft, setDraft] = useState({ username: "", fullName: "", position: "", password: "", inviteCode: "" });
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (mode === "login") {
        await props.onLogin({ username: draft.username, password: draft.password });
      } else {
        if (draft.password.length <= 6) throw new Error("密码必须大于6位");
        if (!draft.inviteCode.trim()) throw new Error("邀请码不能为空");
        await props.onRegister(draft);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit} autoComplete="off">
        <span className="eyebrow">LAW OFFICE</span>
        <h1>律师案件进度助手</h1>
        <div className="segmented">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setDraft({ username: "", fullName: "", position: "", password: "", inviteCode: "" });
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setDraft({ username: "", fullName: "", position: "", password: "", inviteCode: "" });
            }}
          >
            注册
          </button>
        </div>
        <label>
          <span>用户名</span>
          <input
            value={draft.username}
            autoComplete="off"
            onChange={(event) => setDraft({ ...draft, username: event.target.value })}
          />
        </label>
        {mode === "register" && (
          <>
            <label>
              <span>姓名</span>
              <input value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })} />
            </label>
            <label>
              <span>职位</span>
              <input value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value })} />
            </label>
            <label>
              <span>邀请码</span>
              <input
                value={draft.inviteCode}
                autoComplete="off"
                maxLength={6}
                onChange={(event) => setDraft({ ...draft, inviteCode: event.target.value.trim() })}
              />
            </label>
          </>
        )}
        <label>
          <span>密码</span>
          <input
            type="password"
            value={draft.password}
            autoComplete="new-password"
            onChange={(event) => setDraft({ ...draft, password: event.target.value })}
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit">{mode === "login" ? "登录系统" : "注册并登录"}</button>
      </form>
    </main>
  );
}

function BusinessLogsView(props: { logs: BusinessLog[]; refresh: () => void }) {
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">AUDIT TRAIL</span>
            <h2>业务日志</h2>
          </div>
          <button onClick={props.refresh}>刷新日志</button>
        </div>
        <div className="log-list">
          {props.logs.map((log) => (
            <article className="log-row" key={log.id}>
              <time>{log.created_at}</time>
              <strong>{log.action}</strong>
              <span>{log.username || "系统"}</span>
              <p>{[log.target_type, log.target_id, log.detail].filter(Boolean).join(" · ") || "无补充信息"}</p>
              <small>{log.ip}</small>
            </article>
          ))}
          {!props.logs.length && <p className="empty-state">暂无业务日志。</p>}
        </div>
      </section>
    </div>
  );
}

function AccountManagementView(props: {
  users: AuthUser[];
  inviteCode: string;
  refresh: () => void;
  refreshInviteCode: () => void;
  resetInviteCode: () => void;
  toggleUser: (user: AuthUser) => void;
  resetPassword: (user: AuthUser) => void;
}) {
  return (
    <div className="stack">
      <section className="panel invite-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">TEAM INVITE</span>
            <h2>注册邀请码</h2>
          </div>
          <div className="actions">
            <button className="secondary" onClick={props.refreshInviteCode}>刷新显示</button>
            <button onClick={props.resetInviteCode}>重置邀请码</button>
          </div>
        </div>
        <p className="hint">新成员注册时必须填写当前邀请码。重置后，旧邀请码立即失效。</p>
        <div className="invite-code-box" aria-label="当前注册邀请码">
          {props.inviteCode || "------"}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">TEAM ACCESS</span>
            <h2>账号管理</h2>
          </div>
          <button onClick={props.refresh}>刷新账号</button>
        </div>
        <div className="account-list">
          {props.users.map((user) => (
            <article className="account-row" key={user.id}>
              <div>
                <strong>{user.full_name}</strong>
                <span>{user.username}</span>
              </div>
              <span>{user.position || "未填写职位"}</span>
              <span className={user.active ? "status-chip" : "status-chip closed"}>{user.active ? "启用" : "停用"}</span>
              <small>{user.created_at || ""}</small>
              <div className="actions">
                <button className="secondary" onClick={() => props.resetPassword(user)}>重置密码</button>
                <button className="secondary" onClick={() => props.toggleUser(user)} disabled={user.is_admin}>
                  {user.active ? "停用" : "启用"}
                </button>
              </div>
            </article>
          ))}
          {!props.users.length && <p className="empty-state">暂无账号。</p>}
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("cases");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [editingCase, setEditingCase] = useState<CaseRecord>(emptyCase());
  const [eventDraft, setEventDraft] = useState<EventRecord>(emptyEvent);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
  const [fieldDraft, setFieldDraft] = useState({ label: "", field_type: "text", options: "" });
  const [exportScope, setExportScope] = useState("all");
  const [exportStatus, setExportStatus] = useState("");
  const [mappingsDraft, setMappingsDraft] = useState<ExportMapping[]>([]);
  const [aiSummaryDrafts, setAiSummaryDrafts] = useState<Record<string, string>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [errorNotice, setErrorNotice] = useState("");
  const [businessLogs, setBusinessLogs] = useState<BusinessLog[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const busyRef = useRef(false);

  async function refresh() {
    setLoadError("");
    const next = await window.lawyerAPI.call("getState");
    setState(next);
    setSettingsDraft(next.settings);
    setMappingsDraft(next.exportMappings);
    if (!selectedCaseId && next.cases.length) {
      setSelectedCaseId(next.cases[0].id);
    }
  }

  async function withBusy<T>(label: string, task: () => Promise<T>): Promise<T | undefined> {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusyMessage(label);
    setErrorNotice("");
    try {
      return await task();
    } finally {
      busyRef.current = false;
      setBusyMessage("");
    }
  }

  function showError(error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    setMessage(text);
    setErrorNotice(text);
  }

  async function call(command: string, payload: unknown, success: string) {
    return withBusy(success.replace(/已.*/, "处理中...") || "处理中...", async () => {
      const next = await window.lawyerAPI.call(command, payload);
      if (next?.ok === false) throw new Error(next.error || "操作失败");
      if (next?.cases) {
        setState(next);
        setSettingsDraft(next.settings);
        setMappingsDraft(next.exportMappings);
      }
      setMessage(success);
      return next;
    }).catch((error: any) => {
      showError(error);
      return undefined;
    });
  }

  useEffect(() => {
    window.lawyerAPI.authMe()
      .then(async (result) => {
        if (result.user) {
          setAuthUser(result.user);
          await refresh();
        }
      })
      .catch((error) => {
        setLoadError(error.message || String(error));
      })
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (authUser && tab === "logs") {
      loadBusinessLogs().catch(showError);
    }
    if (authUser?.is_admin && tab === "accounts") {
      loadUsers().catch(showError);
    }
    if (authUser?.is_admin && tab === "settings") {
      loadInviteCode().catch(showError);
    }
    if (authUser && !authUser.is_admin && ["accounts", "settings"].includes(tab)) {
      setTab("cases");
    }
  }, [authUser, tab]);

  async function login(payload: { username: string; password: string }) {
    await withBusy("正在登录...", async () => {
      const result = await window.lawyerAPI.login(payload);
      setAuthUser(result.user);
      await refresh();
      setMessage(`已登录：${result.user.full_name || result.user.username}`);
    });
  }

  async function register(payload: { username: string; fullName: string; position: string; password: string; inviteCode: string }) {
    await withBusy("正在注册账号...", async () => {
      const result = await window.lawyerAPI.register(payload);
      setAuthUser(result.user);
      await refresh();
      setMessage(`已注册并登录：${result.user.full_name || result.user.username}`);
    });
  }

  async function logout() {
    await withBusy("正在退出登录...", async () => {
      await window.lawyerAPI.logout();
      setAuthUser(null);
      setState(null);
      setBusinessLogs([]);
      setUsers([]);
      setTab("cases");
      setMessage("");
    });
  }

  async function loadBusinessLogs() {
    const result = await window.lawyerAPI.businessLogs();
    setBusinessLogs(result.logs || []);
  }

  async function loadUsers() {
    const result = await window.lawyerAPI.listUsers();
    setUsers(result.users || []);
  }

  async function loadInviteCode() {
    const result = await window.lawyerAPI.getInviteCode();
    setInviteCode(result.inviteCode || "");
  }

  async function resetInviteCode() {
    await withBusy("正在重置邀请码...", async () => {
      const result = await window.lawyerAPI.resetInviteCode();
      setInviteCode(result.inviteCode || "");
      setMessage("注册邀请码已重置");
    }).catch(showError);
  }

  async function toggleUser(user: AuthUser) {
    await withBusy(user.active ? "正在停用账号..." : "正在启用账号...", async () => {
      const result = await window.lawyerAPI.updateUser(user.id, { active: !user.active });
      setUsers(result.users || []);
      setMessage(user.active ? "账号已停用" : "账号已启用");
    }).catch(showError);
  }

  async function resetUserPassword(user: AuthUser) {
    const password = window.prompt(`请输入 ${user.full_name || user.username} 的新密码，必须大于6位`);
    if (password === null) return;
    if (password.length <= 6) {
      showError("密码必须大于6位");
      return;
    }
    await withBusy("正在重置密码...", async () => {
      const result = await window.lawyerAPI.updateUser(user.id, { password });
      setUsers(result.users || []);
      setMessage("账号密码已重置");
    }).catch(showError);
  }

  const visibleFields = useMemo(
    () => (state?.fields || []).filter((field) => field.active && field.visible),
    [state]
  );

  const filteredCases = useMemo(() => {
    const cases = state?.cases || [];
    const text = query.trim().toLowerCase();
    if (!text) return cases;
    return cases.filter((item) =>
      JSON.stringify(item).toLowerCase().includes(text)
    );
  }, [state, query]);

  const selectedCase = useMemo(
    () => (state?.cases || []).find((item) => item.id === selectedCaseId),
    [state, selectedCaseId]
  );
  const selectedAiSummaryDraft = selectedCaseId
    ? Object.prototype.hasOwnProperty.call(aiSummaryDrafts, selectedCaseId)
      ? aiSummaryDrafts[selectedCaseId]
      : selectedCase?.ai_progress_summary || ""
    : "";

  function setSelectedAiSummaryDraft(value: string) {
    if (!selectedCaseId) return;
    setAiSummaryDrafts((current) => ({ ...current, [selectedCaseId]: value }));
  }

  function editCase(item?: CaseRecord) {
    const next = item ? { ...item, custom_values: { ...(item.custom_values || {}) } } : emptyCase();
    setEditingCase(next);
    setSelectedCaseId(item?.id || "");
  }

  function setCaseValue(field: CaseField, value: string) {
    if (field.builtin) {
      setEditingCase((current) => ({ ...current, [field.field_key]: value }));
    } else {
      setEditingCase((current) => ({
        ...current,
        custom_values: { ...(current.custom_values || {}), [field.id]: value }
      }));
    }
  }

  function caseValue(field: CaseField) {
    if (field.builtin) return editingCase[field.field_key] || "";
    return editingCase.custom_values?.[field.id] || "";
  }

  async function saveCurrentCase() {
    await call(
      "saveCase",
      { case: editingCase, customValues: editingCase.custom_values || {} },
      "案件已保存"
    );
  }

  async function deleteCurrentCase(caseId: string) {
    const result = await call("deleteCase", { caseId }, "案件已停用，已切换到新增案件");
    if (result?.cases) {
      setEditingCase(emptyCase());
      setSelectedCaseId("");
    }
  }

  async function saveCurrentEvent() {
    const caseId = eventDraft.case_id || selectedCaseId;
    await call("saveEvent", { event: { ...eventDraft, case_id: caseId } }, "事件已保存");
    setEventDraft({ ...emptyEvent, case_id: caseId });
  }

  async function uploadFiles() {
    const caseId = selectedCaseId || eventDraft.case_id;
    const paths = await window.lawyerAPI.chooseFiles();
    if (!paths.length) return;
    await call("uploadFiles", { caseId, paths }, "文件已复制进案件资料库");
  }

  async function runOcr(documentId: string, mode: "local" | "vlm" | "auto") {
    await call("runOcr", { documentId, mode }, mode === "vlm" ? "VLM OCR 已完成，结果待确认" : "本地 OCR 已完成，结果待确认");
  }

  async function createEventFromOcr(ocrResultId: string) {
    await call("createEventFromOcr", { ocrResultId }, "已根据 OCR 结果生成往来事件和待确认期限");
  }

  async function confirmDeadline(deadline: Deadline, confirmed: boolean) {
    if (confirmed && deadline.deadline_date && deadline.deadline_date < todayText()) {
      const cancel = window.confirm("该期限早于今天，属于历史待办。是否取消提醒并保留记录？");
      if (cancel) {
        await call("cancelDeadline", { deadlineId: deadline.id }, "历史期限已取消提醒");
        return;
      }
    }
    await call("confirmDeadline", { deadlineId: deadline.id, confirmed, confirmPast: true }, "期限状态已更新");
  }

  async function deleteDeadline(deadlineId: string) {
    if (!window.confirm("确认删除这条期限记录？")) return;
    await call("deleteDeadline", { deadlineId }, "期限记录已删除");
  }

  async function cancelDeadline(deadlineId: string) {
    await call("cancelDeadline", { deadlineId }, "该期限已取消提醒");
  }

  async function openDocumentFolder(path: string) {
    await window.lawyerAPI.openInFolder(path);
  }

  async function generateAiSummary() {
    const caseId = selectedCaseId;
    if (!caseId) {
      showError("请先选择案件");
      return;
    }
    await withBusy("正在整理事件进度摘要...", async () => {
      const result = await window.lawyerAPI.call("generateProgressSummary", { caseId });
      setAiSummaryDrafts((current) => ({ ...current, [caseId]: result.summary || "" }));
      setMessage(result.usedLlm ? "大模型已整理进度，请确认后保存" : "未配置大模型，已生成本地事件流水摘要");
    }).catch(showError);
  }

  async function saveAiSummary() {
    if (!selectedCaseId) return;
    await call("saveProgressSummary", { caseId: selectedCaseId, summary: selectedAiSummaryDraft }, "AI/摘要进度已确认保存");
  }

  async function exportExcel() {
    const defaultName = `${settingsDraft.lawyer_name || "律所"}案件进度跟踪表${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`;
    const outputPath = await window.lawyerAPI.chooseSavePath(defaultName);
    if (!outputPath) return;
    await withBusy("正在导出 Excel...", async () => {
      const result = await window.lawyerAPI.call("exportExcel", {
        outputPath,
        scope: {
          mode: exportScope,
          statuses: exportStatus.split(/[,\n，]/).map((item) => item.trim()).filter(Boolean)
        }
      });
      if (result.ok) setMessage(`已导出 ${result.count} 个案件：${result.path}`);
    }).catch(showError);
  }

  async function importDatabase() {
    if (!window.confirm("导入旧数据库会用上传文件覆盖云端案件、事件、字段、设置和导出映射。系统会先备份当前云端数据库，账号和业务日志会保留。确认继续？")) {
      return;
    }
    await withBusy("正在导入旧数据库...", async () => {
      const result = await window.lawyerAPI.uploadDatabase();
      if (result.canceled) return;
      if (result.ok === false) throw new Error(result.error || "数据库导入失败");
      await refresh();
      setMessage(`旧数据库已导入，导入前备份：${result.backupPath || "无"}`);
    }).catch(showError);
  }

  if (!authReady) {
    return (
      <main className="loading">
        <div className="startup-card">
          <h1>律师案件进度助手</h1>
          <p>正在检查登录状态...</p>
        </div>
      </main>
    );
  }

  if (!authUser) {
    return <AuthView onLogin={login} onRegister={register} />;
  }

  if (!state) {
    return (
      <main className="loading">
        <div className="startup-card">
          <h1>律师案件进度助手</h1>
          <p>{loadError ? "服务器接口连接失败" : "正在连接案件数据库..."}</p>
          {loadError && <pre>{loadError}</pre>}
          {loadError && <button onClick={() => refresh().catch((error) => {
            setLoadError(error.message || String(error));
            showError(error);
          })}>重试</button>}
        </div>
      </main>
    );
  }

  const navItems: string[][] = authUser.is_admin
    ? [...TAB_ITEMS, ["accounts", "账号管理", "团队"]]
    : TAB_ITEMS.filter(([key]) => key !== "settings");

  return (
    <main className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className={sidebarCollapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="brand-block">
          <div className="brand-mark">L</div>
          <div>
            <span>LAW OFFICE</span>
            <h1>案件进度控制台</h1>
          </div>
        </div>
        <button
          className="sidebar-collapse"
          type="button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          title={sidebarCollapsed ? "展开菜单" : "收起菜单"}
        >
          =
        </button>
        <nav>
          {navItems.map(([key, label, subLabel]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)} title={label}>
              <span className="nav-glyph" aria-hidden="true" />
              <span>
                <strong>{label}</strong>
                <em>{subLabel}</em>
              </span>
              <i aria-hidden="true">›</i>
            </button>
          ))}
        </nav>
        <div className="status-line">
          <span>SERVER DATABASE</span>
          <strong>{message || "数据保存在服务器，AI 和云 OCR 默认关闭。"}</strong>
          <small>{state.dbPath}</small>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <span>AI CONSOLE</span>
            <h2>律师案件进度助手</h2>
          </div>
          <div className="operator-pill">
            <span>{authUser.full_name}</span>
            <button type="button" className="secondary" onClick={logout}>退出</button>
          </div>
        </header>
        {tab === "dashboard" && (
          <DashboardView
            cases={state.cases}
            events={state.events}
            deadlines={state.deadlines}
            setTab={setTab}
            editCase={editCase}
            setSelectedCaseId={setSelectedCaseId}
          />
        )}
        {tab === "cases" && (
          <CasesView
            fields={visibleFields}
            cases={filteredCases}
            query={query}
            setQuery={setQuery}
            selectedCaseId={selectedCaseId}
            setSelectedCaseId={setSelectedCaseId}
            editingCase={editingCase}
            editCase={editCase}
            caseValue={caseValue}
            setCaseValue={setCaseValue}
            saveCurrentCase={saveCurrentCase}
            deleteCase={deleteCurrentCase}
          />
        )}
        {tab === "events" && (
          <EventsView
            cases={state.cases}
            selectedCaseId={selectedCaseId}
            setSelectedCaseId={setSelectedCaseId}
            selectedCase={selectedCase}
            eventDraft={eventDraft}
            setEventDraft={setEventDraft}
            saveCurrentEvent={saveCurrentEvent}
            uploadFiles={uploadFiles}
            events={state.events}
            documents={state.documents}
            deadlines={state.deadlines}
            ocrResults={state.ocrResults}
            confirmDeadline={confirmDeadline}
            deleteDeadline={deleteDeadline}
            cancelDeadline={cancelDeadline}
            runOcr={runOcr}
            createEventFromOcr={createEventFromOcr}
            deleteEvent={(eventId) => call("deleteEvent", { eventId }, "事件已删除")}
            deleteDocument={(documentId) => call("deleteDocument", { documentId, removeFile: false }, "文件记录已删除，归档文件保留")}
            openDocumentFolder={openDocumentFolder}
            editEvent={(event) => setEventDraft(event)}
            generateAiSummary={generateAiSummary}
            aiSummaryDraft={selectedAiSummaryDraft}
            setAiSummaryDraft={setSelectedAiSummaryDraft}
            saveAiSummary={saveAiSummary}
          />
        )}
        {tab === "eventDetails" && (
          <EventDetailsView
            cases={state.cases}
            events={state.events}
            deadlines={state.deadlines}
            documents={state.documents}
            selectedCaseId={selectedCaseId}
            setSelectedCaseId={setSelectedCaseId}
          />
        )}
        {tab === "export" && (
          <ExportView
            fields={state.fields}
            mappingsDraft={mappingsDraft}
            setMappingsDraft={setMappingsDraft}
            exportScope={exportScope}
            setExportScope={setExportScope}
            exportStatus={exportStatus}
            setExportStatus={setExportStatus}
            exportExcel={exportExcel}
            saveMappings={() => call("saveExportMappings", { mappings: mappingsDraft }, "导出映射已保存")}
          />
        )}
        {tab === "settings" && (
          <SettingsView
            fields={state.fields}
            settingsDraft={settingsDraft}
            setSettingsDraft={setSettingsDraft}
            saveSettings={() => call("saveSettings", { settings: settingsDraft }, "设置已保存")}
            chooseDirectory={async (key) => {
              const value = await window.lawyerAPI.chooseDirectory();
              if (value) setSettingsDraft((current) => ({ ...current, [key]: value }));
            }}
            chooseTemplate={async () => {
              const value = await window.lawyerAPI.chooseFiles();
              if (value[0]) setSettingsDraft((current) => ({ ...current, excel_template_path: value[0] }));
            }}
            fieldDraft={fieldDraft}
            setFieldDraft={setFieldDraft}
            saveField={(field) => call("saveField", { field }, "字段已保存")}
            addField={() => {
              const options = fieldDraft.options.split(/[,\n，]/).map((item) => item.trim()).filter(Boolean);
              call("saveField", { field: { ...fieldDraft, options } }, "字段已新增");
              setFieldDraft({ label: "", field_type: "text", options: "" });
            }}
            reorderFields={(ids) => call("reorderFields", { fieldIds: ids }, "字段顺序已保存")}
            backup={() => call("makeBackup", {}, "本地备份已创建")}
            uploadDatabase={importDatabase}
            sendTestFeishu={() => call("sendTestFeishu", { text: "律师案件进度助手测试消息" }, "飞书测试消息已发送")}
            checkReminders={async () => {
              await withBusy("正在检查并发送提醒...", async () => {
                const result = await window.lawyerAPI.call("checkReminders", {});
                setMessage(`提醒检查完成：检查 ${result.checked || 0} 条，发送 ${result.sent?.length || 0} 条，跳过 ${result.skipped?.length || 0} 条。${result.note || ""}`);
              }).catch(showError);
            }}
          />
        )}
        {tab === "logs" && (
          <BusinessLogsView
            logs={businessLogs}
            refresh={() => loadBusinessLogs().catch(showError)}
          />
        )}
        {tab === "accounts" && authUser.is_admin && (
          <AccountManagementView
            users={users}
            inviteCode={inviteCode}
            refresh={() => loadUsers().catch(showError)}
            refreshInviteCode={() => loadInviteCode().catch(showError)}
            resetInviteCode={resetInviteCode}
            toggleUser={toggleUser}
            resetPassword={resetUserPassword}
          />
        )}
      </section>
      {busyMessage && (
        <div className="busy-overlay" role="alert" aria-live="assertive">
          <div className="busy-card">
            <span className="busy-spinner" />
            <strong>{busyMessage}</strong>
            <p>请等待当前操作完成</p>
          </div>
        </div>
      )}
      {errorNotice && !busyMessage && (
        <div className="notice-overlay" role="alert" aria-live="assertive">
          <div className="error-card">
            <span className="error-icon" aria-hidden="true">×</span>
            <strong>操作未完成</strong>
            <p>{errorNotice}</p>
            <button type="button" onClick={() => setErrorNotice("")}>知道了</button>
          </div>
        </div>
      )}
    </main>
  );
}

function FieldInput({
  field,
  value,
  onChange
}: {
  field: CaseField;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = parseOptions(field);
  if (field.field_type === "long_text") {
    return <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} />;
  }
  if ((field.field_type === "select" || field.field_type === "multi_select") && options.length) {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">未填写</option>
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  const type = field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text";
  return <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />;
}

function splitJoinedValue(value: string) {
  if (!value) return [];
  return value.split(/[，,;\n]/).map((item) => item.trim());
}

function joinJoinedValue(values: string[]) {
  return values.map((item) => item.trim()).join("，");
}

function OpposingPartiesEditor(props: {
  recordKey: string;
  partyField: CaseField;
  roleField: CaseField;
  partyValue: string;
  roleValue: string;
  setCaseValue: (field: CaseField, value: string) => void;
}) {
  function rowsFromValues(partyValue: string, roleValue: string) {
    const parties = splitJoinedValue(partyValue);
    const roles = splitJoinedValue(roleValue);
    const count = Math.max(1, parties.length, roles.length);
    return Array.from({ length: count }, (_, index) => ({
      party: parties[index] || "",
      role: roles[index] || ""
    }));
  }

  const [rows, setRows] = useState(() => rowsFromValues(props.partyValue, props.roleValue));

  useEffect(() => {
    setRows(rowsFromValues(props.partyValue, props.roleValue));
  }, [props.recordKey]);

  function commit(nextRows: Array<{ party: string; role: string }>) {
    let last = nextRows.length - 1;
    while (last > 0 && !nextRows[last].party.trim() && !nextRows[last].role.trim()) {
      last -= 1;
    }
    const compactRows = nextRows.slice(0, last + 1);
    props.setCaseValue(props.partyField, joinJoinedValue(compactRows.map((row) => row.party)));
    props.setCaseValue(props.roleField, joinJoinedValue(compactRows.map((row) => row.role)));
  }

  function update(index: number, key: "party" | "role", value: string) {
    const nextRows = rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row));
    setRows(nextRows);
    commit(nextRows);
  }

  function addRow() {
    setRows([...rows, { party: "", role: "" }]);
  }

  function removeRow(index: number) {
    if (index === 0) {
      const clearedRows = rows.map(() => ({ party: "", role: "" }));
      setRows(clearedRows);
      commit(clearedRows);
      return;
    }
    const nextRows = rows.filter((_row, rowIndex) => rowIndex !== index);
    setRows(nextRows);
    commit(nextRows);
  }

  return (
    <div className="opposing-parties wide">
      <div className="opposing-header">
        <span>对方当事人</span>
        <button type="button" className="secondary" onClick={addRow}>+ 添加对方当事人</button>
      </div>
      {rows.map((row, index) => (
        <div className="opposing-row" key={index}>
          <label>
            <span>{index === 0 ? props.partyField.label : `${props.partyField.label}${index + 1}`}</span>
            <input value={row.party} onChange={(event) => update(index, "party", event.target.value)} />
          </label>
          <label>
            <span>{index === 0 ? props.roleField.label : `${props.roleField.label}${index + 1}`}</span>
            <input value={row.role} onChange={(event) => update(index, "role", event.target.value)} />
          </label>
          <button type="button" className="secondary" onClick={() => removeRow(index)}>
            {index === 0 ? "清空" : "删除"}
          </button>
        </div>
      ))}
      <p className="hint">保存时会写入原“对方当事人”和“对方主体地位”字段，Excel 导出仍在原列中用逗号分隔。</p>
    </div>
  );
}

function CasesView(props: {
  fields: CaseField[];
  cases: CaseRecord[];
  query: string;
  setQuery: (value: string) => void;
  selectedCaseId: string;
  setSelectedCaseId: (value: string) => void;
  editingCase: CaseRecord;
  editCase: (item?: CaseRecord) => void;
  caseValue: (field: CaseField) => string;
  setCaseValue: (field: CaseField, value: string) => void;
  saveCurrentCase: () => void;
  deleteCase: (caseId: string) => void;
}) {
  const opposingPartyField = props.fields.find((field) => field.field_key === "opposing_party");
  const opposingRoleField = props.fields.find((field) => field.field_key === "opposing_role");

  return (
    <div className="two-column">
      <section className="panel list-panel">
        <div className="panel-heading">
          <h2>案件台账</h2>
          <button onClick={() => props.editCase()}>新增案件</button>
        </div>
        <input
          className="search"
          placeholder="搜索当事人、案号、法院、状态"
          value={props.query}
          onChange={(event) => props.setQuery(event.target.value)}
        />
        <div className="case-list">
          {props.cases.map((item) => (
            <button
              key={item.id}
              className={props.selectedCaseId === item.id ? "case-item active" : "case-item"}
              onClick={() => {
                props.setSelectedCaseId(item.id || "");
                props.editCase(item);
              }}
            >
              <strong>{displayCaseTitle(item)}</strong>
              <span>{item.related_case_numbers || item.court || "暂无案号/法院"}</span>
              <em>{item.status || "未设状态"}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>{props.editingCase.id ? "编辑案件" : "新增案件"}</h2>
          <div className="actions">
            {props.editingCase.id && (
              <button className="secondary" onClick={() => props.deleteCase(props.editingCase.id || "")}>
                停用案件
              </button>
            )}
            <button onClick={props.saveCurrentCase}>保存案件</button>
          </div>
        </div>
        <div className="form-grid">
          {props.fields.map((field) => {
            if (field.field_key === "opposing_role") return null;
            if (field.field_key === "opposing_party" && opposingPartyField && opposingRoleField) {
              return (
                <OpposingPartiesEditor
                  key="opposing-parties"
                  recordKey={props.editingCase.id || "__new_case__"}
                  partyField={opposingPartyField}
                  roleField={opposingRoleField}
                  partyValue={props.caseValue(opposingPartyField)}
                  roleValue={props.caseValue(opposingRoleField)}
                  setCaseValue={props.setCaseValue}
                />
              );
            }
            return (
              <label key={field.id} className={field.field_type === "long_text" ? "wide" : ""}>
                <span>{field.label}</span>
                <FieldInput field={field} value={props.caseValue(field)} onChange={(value) => props.setCaseValue(field, value)} />
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function EventsView(props: {
  cases: CaseRecord[];
  selectedCaseId: string;
  setSelectedCaseId: (value: string) => void;
  selectedCase?: CaseRecord;
  eventDraft: EventRecord;
  setEventDraft: (event: EventRecord) => void;
  saveCurrentEvent: () => void;
  uploadFiles: () => void;
  events: EventRecord[];
  documents: DocumentRecord[];
  deadlines: Deadline[];
  ocrResults: OcrResult[];
  confirmDeadline: (deadline: Deadline, confirmed: boolean) => void;
  deleteDeadline: (deadlineId: string) => void;
  cancelDeadline: (deadlineId: string) => void;
  runOcr: (documentId: string, mode: "local" | "vlm" | "auto") => void;
  createEventFromOcr: (ocrResultId: string) => void;
  deleteEvent: (eventId: string) => void;
  deleteDocument: (documentId: string) => void;
  openDocumentFolder: (path: string) => void;
  editEvent: (event: EventRecord) => void;
  generateAiSummary: () => void;
  aiSummaryDraft: string;
  setAiSummaryDraft: (value: string) => void;
  saveAiSummary: () => void;
}) {
  const caseEvents = props.events
    .filter((event) => event.case_id === props.selectedCaseId)
    .sort((left, right) => (left.event_date || "").localeCompare(right.event_date || ""));
  const caseDocuments = props.documents.filter((doc) => doc.case_id === props.selectedCaseId);
  const caseDeadlines = props.deadlines.filter((deadline) => deadline.case_id === props.selectedCaseId);
  const caseOcrResults = props.ocrResults.filter((result) => result.case_id === props.selectedCaseId);
  const updateEvent = (key: keyof EventRecord, value: string) => {
    props.setEventDraft({ ...props.eventDraft, [key]: value });
  };
  return (
    <div className="stack workflow-page">
      <section className="panel workflow-header">
        <div>
          <h2>往来事件与文件</h2>
          <p>按顺序完成：选择案件，上传文件，OCR 识别，生成事件/期限，最后确认并更新事件。</p>
        </div>
        <select value={props.selectedCaseId} onChange={(event) => props.setSelectedCaseId(event.target.value)}>
          <option value="">选择案件</option>
          {props.cases.map((item) => (
            <option key={item.id} value={item.id}>
              {displayCaseTitle(item)}
            </option>
          ))}
        </select>
      </section>

      <section className="workflow-grid">
        <article className="panel workflow-step">
          <div className="step-title"><span>1</span><h3>上传并归档文件</h3></div>
          <p className="hint">先把传票、缴费通知书、裁定书、判决书等文件归档到当前案件。</p>
          <div className="actions">
            <button onClick={props.uploadFiles} disabled={!props.selectedCaseId}>上传文件</button>
          </div>
          <div className="doc-list">
            {caseDocuments.map((doc) => (
              <div className="doc-row" key={doc.id}>
                <strong>{doc.file_name}</strong>
                <span>{doc.ocr_status === "pending" ? "待 OCR/待确认" : doc.ocr_status}</span>
                <small>{doc.stored_path}</small>
                <div className="actions">
                  <button onClick={() => props.runOcr(doc.id, "local")}>本地 OCR</button>
                  <button className="secondary" onClick={() => props.runOcr(doc.id, "vlm")}>VLM OCR</button>
                  <button className="secondary" onClick={() => props.openDocumentFolder(doc.stored_path)}>下载文件</button>
                  <button className="secondary" onClick={() => props.deleteDocument(doc.id)}>删除记录</button>
                </div>
              </div>
            ))}
            {!caseDocuments.length && <p className="empty-state">当前案件还没有归档文件。</p>}
          </div>
        </article>

        <article className="panel workflow-step">
          <div className="step-title"><span>2</span><h3>确认 OCR 结果</h3></div>
          <p className="hint">识别结果确认后，点击生成事件/期限。裁定书如包含多类财产，会生成多条续封提醒。</p>
          <div className="ocr-list compact-list">
            {caseOcrResults.map((result) => (
              <article key={result.id}>
                <strong>{result.engine} · {result.status}</strong>
                <pre>{JSON.stringify(safeJson(result.extracted_json), null, 2)}</pre>
                <div className="actions">
                  <button
                    onClick={() => props.createEventFromOcr(result.id)}
                    disabled={result.status !== "pending_review"}
                  >
                    按识别结果生成事件/期限
                  </button>
                </div>
                <details>
                  <summary>查看 OCR 原文</summary>
                  <pre>{result.raw_text}</pre>
                </details>
              </article>
            ))}
            {!caseOcrResults.length && <p className="empty-state">上传文件并执行 OCR 后，结果会出现在这里。</p>}
          </div>
        </article>
      </section>

      <section className="panel workflow-step event-editor-panel">
        <div className="step-title"><span>3</span><h3>{props.eventDraft.id ? "编辑并更新事件" : "手动录入事件"}</h3></div>
        <div className="form-grid">
          <label>
            <span>事件日期</span>
            <input type="date" value={props.eventDraft.event_date} onChange={(event) => updateEvent("event_date", event.target.value)} />
          </label>
          <label>
            <span>方向</span>
            <select value={props.eventDraft.direction} onChange={(event) => updateEvent("direction", event.target.value)}>
              <option>收到</option>
              <option>发出</option>
              <option>电话</option>
              <option>会面</option>
              <option>系统记录</option>
            </select>
          </label>
          <label>
            <span>对象类型</span>
            <input value={props.eventDraft.counterparty_type} onChange={(event) => updateEvent("counterparty_type", event.target.value)} />
          </label>
          <label>
            <span>对象名称</span>
            <input value={props.eventDraft.counterparty_name} onChange={(event) => updateEvent("counterparty_name", event.target.value)} />
          </label>
          <label className="wide">
            <span>事件摘要</span>
            <textarea rows={3} value={props.eventDraft.summary} onChange={(event) => updateEvent("summary", event.target.value)} />
          </label>
          <label>
            <span>识别/录入期限</span>
            <input type="date" value={props.eventDraft.deadline_date} onChange={(event) => updateEvent("deadline_date", event.target.value)} />
          </label>
          <label>
            <span>期限说明</span>
            <input value={props.eventDraft.deadline_text} onChange={(event) => updateEvent("deadline_text", event.target.value)} />
          </label>
          <label className="wide">
            <span>OCR 原文或备注</span>
            <textarea rows={3} value={props.eventDraft.ocr_text} onChange={(event) => updateEvent("ocr_text", event.target.value)} />
          </label>
        </div>
        <div className="actions editor-actions">
          <button onClick={props.saveCurrentEvent} disabled={!props.selectedCaseId && !props.eventDraft.case_id}>
            {props.eventDraft.id ? "更新事件" : "保存事件"}
          </button>
          <button className="secondary" onClick={() => props.setEventDraft({ ...emptyEvent, case_id: props.selectedCaseId })}>
            清空编辑区
          </button>
          <button className="secondary" onClick={props.generateAiSummary} disabled={!props.selectedCaseId}>
            AI/本地整理进度
          </button>
        </div>
        <label className="wide ai-box">
          <span>事件进度摘要，确认后导出到“事件进度摘要”列；不会覆盖案件管理的“工作进度”</span>
          <textarea rows={5} value={props.aiSummaryDraft} onChange={(event) => props.setAiSummaryDraft(event.target.value)} />
          <button onClick={props.saveAiSummary} disabled={!props.selectedCaseId || !props.aiSummaryDraft.trim()}>
            确认并保存事件进度摘要
          </button>
        </label>
      </section>

      <section className="workflow-grid bottom-grid">
        <article className="panel workflow-step">
          <div className="step-title"><span>4</span><h3>事件流水</h3></div>
          <div className="timeline">
            {caseEvents.map((event) => (
              <article key={event.id}>
                <time>{event.event_date}</time>
                <strong>{event.direction} {event.counterparty_type} {event.counterparty_name}</strong>
                <p>{event.summary}</p>
                <div className="actions">
                  <button className="secondary" onClick={() => props.editEvent(event)}>编辑</button>
                  <button className="secondary" onClick={() => props.deleteEvent(event.id || "")}>删除</button>
                </div>
              </article>
            ))}
            {!caseEvents.length && <p className="empty-state">生成或保存事件后，会按时间顺序显示在这里。</p>}
          </div>
        </article>

        <article className="panel workflow-step">
          <div className="step-title"><span>5</span><h3>期限与提醒</h3></div>
          <div className="deadline-list">
            {caseDeadlines.map((deadline) => (
              <div className="deadline" key={deadline.id}>
                <span>{deadline.deadline_date}</span>
                <strong>{deadline.title}</strong>
                <em>{deadline.confirmed ? "已确认提醒" : "待确认"}</em>
                <div className="actions">
                  <button onClick={() => props.confirmDeadline(deadline, !deadline.confirmed)}>
                    {deadline.confirmed ? "取消确认" : "确认提醒"}
                  </button>
                  <button className="secondary" onClick={() => props.cancelDeadline(deadline.id)}>取消提醒</button>
                  <button className="secondary" onClick={() => props.deleteDeadline(deadline.id)}>删除</button>
                </div>
              </div>
            ))}
            {!caseDeadlines.length && <p className="empty-state">带期限的事件会在这里形成待确认提醒。</p>}
          </div>
        </article>
      </section>
    </div>
  );
}

function EventDetailsView(props: {
  cases: CaseRecord[];
  events: EventRecord[];
  deadlines: Deadline[];
  documents: DocumentRecord[];
  selectedCaseId: string;
  setSelectedCaseId: (value: string) => void;
}) {
  const selectedCase = props.cases.find((item) => item.id === props.selectedCaseId) || props.cases[0];
  const caseId = selectedCase?.id || "";
  const caseEvents = props.events
    .filter((event) => event.case_id === caseId)
    .sort((left, right) => {
      const byDate = (left.event_date || "").localeCompare(right.event_date || "");
      if (byDate !== 0) return byDate;
      return (left.id || "").localeCompare(right.id || "");
    });
  const caseDeadlines = props.deadlines.filter((deadline) => deadline.case_id === caseId);
  const upcomingDeadline = nextDeadline(props.deadlines, caseId);
  const docsByEvent = props.documents.reduce<Record<string, DocumentRecord[]>>((acc, doc) => {
    if (!doc.event_id) return acc;
    acc[doc.event_id] = [...(acc[doc.event_id] || []), doc];
    return acc;
  }, {});
  const deadlinesByEvent = caseDeadlines.reduce<Record<string, Deadline[]>>((acc, deadline) => {
    const eventId = deadline.event_id || "";
    if (!eventId) return acc;
    acc[eventId] = [...(acc[eventId] || []), deadline];
    return acc;
  }, {});

  useEffect(() => {
    if (!props.selectedCaseId && props.cases[0]?.id) {
      props.setSelectedCaseId(props.cases[0].id);
    }
  }, [props.selectedCaseId, props.cases]);

  return (
    <div className="stack event-details-page">
      <section className="panel detail-hero">
        <div>
          <span className="eyebrow">EVENT LEDGER</span>
          <h2>事件明细</h2>
          <p>按案件查看完整往来流水，核对手动录入、OCR 生成、期限和附件是否上下衔接。</p>
        </div>
        <label>
          <span>选择案件</span>
          <select value={caseId} onChange={(event) => props.setSelectedCaseId(event.target.value)}>
            <option value="">选择案件</option>
            {props.cases.map((item) => (
              <option key={item.id} value={item.id}>
                {displayCaseTitle(item)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {selectedCase ? (
        <>
          <section className="detail-summary">
            <article className="panel detail-case-card">
              <span className="eyebrow">CASE</span>
              <h3>{displayCaseTitle(selectedCase)}</h3>
              <p>{selectedCase.related_case_numbers || "暂无关联案号"}</p>
              <div className="detail-meta">
                <span>{selectedCase.court || "暂无法院"}</span>
                <span>{selectedCase.status || "未设状态"}</span>
                <span>{selectedCase.cause || "暂无案由"}</span>
              </div>
            </article>
            <article className="panel detail-stat">
              <span>事件数量</span>
              <strong>{caseEvents.length}</strong>
            </article>
            <article className="panel detail-stat">
              <span>待确认期限</span>
              <strong>{caseDeadlines.filter((deadline) => !deadline.confirmed).length}</strong>
            </article>
            <article className="panel detail-stat">
              <span>下一期限</span>
              <strong>{upcomingDeadline?.deadline_date || "暂无"}</strong>
            </article>
          </section>

          <section className="panel detail-timeline-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">FULL TIMELINE</span>
                <h3>完整事件流水</h3>
              </div>
            </div>
            <div className="detail-timeline">
              {caseEvents.map((event, index) => {
                const eventDocs = docsByEvent[event.id || ""] || [];
                const eventDeadlines = deadlinesByEvent[event.id || ""] || [];
                return (
                  <article className="detail-event" key={event.id || index}>
                    <div className="detail-event-index">{index + 1}</div>
                    <div className="detail-event-body">
                      <div className="detail-event-head">
                        <time>{event.event_date || "未填日期"}</time>
                        <strong>{[event.direction, event.counterparty_type, event.counterparty_name].filter(Boolean).join(" ") || "事件"}</strong>
                        <span>{event.source || "manual"}</span>
                      </div>
                      <p>{event.summary || "未填写摘要"}</p>
                      {event.deadline_date && (
                        <div className="detail-callout">
                          <strong>期限</strong>
                          <span>{event.deadline_date} {event.deadline_text}</span>
                        </div>
                      )}
                      {eventDeadlines.length > 0 && (
                        <div className="detail-tags">
                          {eventDeadlines.map((deadline) => (
                            <span className={deadline.confirmed ? "status-chip" : "status-chip closed"} key={deadline.id}>
                              {deadline.deadline_date} {deadline.confirmed ? "已确认" : "待确认"}
                            </span>
                          ))}
                        </div>
                      )}
                      {eventDocs.length > 0 && (
                        <div className="detail-files">
                          <strong>附件</strong>
                          {eventDocs.map((doc) => (
                            <span key={doc.id}>{doc.file_name}</span>
                          ))}
                        </div>
                      )}
                      {event.ocr_text && (
                        <details>
                          <summary>查看 OCR 原文/备注</summary>
                          <pre>{event.ocr_text}</pre>
                        </details>
                      )}
                    </div>
                  </article>
                );
              })}
              {!caseEvents.length && <p className="empty-state">当前案件还没有事件流水。手动保存事件或通过 OCR 生成事件后，会显示在这里。</p>}
            </div>
          </section>
        </>
      ) : (
        <section className="panel">
          <p className="empty-state">请先在案件管理中新增案件。</p>
        </section>
      )}
    </div>
  );
}

function ExportView(props: {
  fields: CaseField[];
  mappingsDraft: ExportMapping[];
  setMappingsDraft: (mappings: ExportMapping[]) => void;
  exportScope: string;
  setExportScope: (value: string) => void;
  exportStatus: string;
  setExportStatus: (value: string) => void;
  exportExcel: () => void;
  saveMappings: () => void;
}) {
  const fixedFields = props.fields.filter((field) => field.builtin);
  const customFields = props.fields.filter((field) => !field.builtin && field.active);
  function updateMapping(index: number, patch: Partial<ExportMapping>) {
    const next = [...props.mappingsDraft];
    next[index] = { ...next[index], ...patch };
    props.setMappingsDraft(next);
  }
  function optionValue(mapping: ExportMapping) {
    return `${mapping.source_type}:${mapping.field_key}`;
  }
  function applyOption(index: number, value: string) {
    const [source_type, field_key] = value.split(":");
    updateMapping(index, { source_type, field_key });
  }
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-heading">
          <h2>Excel 导出</h2>
          <button onClick={props.exportExcel}>导出并下载</button>
        </div>
        <div className="form-grid">
          <label>
            <span>导出范围</span>
            <select value={props.exportScope} onChange={(event) => props.setExportScope(event.target.value)}>
              <option value="all">全部案件</option>
              <option value="active">只导出在办案件</option>
              <option value="closed">只导出办结案件</option>
              <option value="status">按状态筛选</option>
            </select>
          </label>
          <label className="wide">
            <span>状态筛选，多个状态用逗号或换行分隔</span>
            <input
              value={props.exportStatus}
              onChange={(event) => props.setExportStatus(event.target.value)}
              placeholder="例如：财产保全，待执行，结案"
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>模板字段映射（默认 A-S）</h2>
          <button onClick={props.saveMappings}>保存映射</button>
        </div>
        <div className="mapping-list">
          {props.mappingsDraft.map((mapping, index) => (
            <div className="mapping-row" key={mapping.column_key}>
              <strong>{mapping.column_key}</strong>
              <input
                value={mapping.column_label}
                onChange={(event) => updateMapping(index, { column_label: event.target.value })}
              />
              <select value={optionValue(mapping)} onChange={(event) => applyOption(index, event.target.value)}>
                <optgroup label="特殊字段">
                  <option value="special:sequence">序号</option>
                  <option value="special:todo_deadlines">待办事项 + 已确认期限</option>
                  <option value="special:progress_events">事件进度摘要 / 全部事件流水</option>
                </optgroup>
                <optgroup label="固定案件字段">
                  {fixedFields.map((field) => (
                    <option key={field.id} value={`fixed:${field.field_key}`}>
                      {field.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="自定义案件字段">
                  {customFields.map((field) => (
                    <option key={field.id} value={`custom:${field.id}`}>
                      {field.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!mapping.enabled}
                  onChange={(event) => updateMapping(index, { enabled: event.target.checked ? 1 : 0 })}
                />
                导出
              </label>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SettingsView(props: {
  fields: CaseField[];
  settingsDraft: Record<string, string>;
  setSettingsDraft: (settings: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
  saveSettings: () => void;
  chooseDirectory: (key: string) => void;
  chooseTemplate: () => void;
  fieldDraft: { label: string; field_type: string; options: string };
  setFieldDraft: (draft: { label: string; field_type: string; options: string }) => void;
  saveField: (field: Partial<CaseField>) => void;
  addField: () => void;
  reorderFields: (ids: string[]) => void;
  backup: () => void;
  uploadDatabase: () => void;
  sendTestFeishu: () => void;
  checkReminders: () => void;
}) {
  const activeFields = props.fields.filter((field) => field.active);
  const isDraftChoiceField = props.fieldDraft.field_type === "select" || props.fieldDraft.field_type === "multi_select";
  function setSetting(key: string, value: string) {
    props.setSettingsDraft((current) => ({ ...current, [key]: value }));
  }
  function updateFieldDraftType(field_type: string) {
    const keepOptions = field_type === "select" || field_type === "multi_select";
    props.setFieldDraft({ ...props.fieldDraft, field_type, options: keepOptions ? props.fieldDraft.options : "" });
  }
  function move(field: CaseField, direction: -1 | 1) {
    const items = [...props.fields];
    const index = items.findIndex((item) => item.id === field.id);
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    props.reorderFields(items.map((item) => item.id));
  }
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-heading">
          <h2>设置中心</h2>
          <div className="actions">
            <button onClick={props.saveSettings}>保存设置</button>
            <button onClick={props.backup}>立即备份</button>
            <button className="secondary" onClick={props.uploadDatabase}>上传旧数据库</button>
            <button onClick={props.sendTestFeishu}>发送飞书测试</button>
            <button onClick={props.checkReminders}>检查并发送提醒</button>
          </div>
        </div>
        <p className="hint">大模型和 VLM/vLLM OCR Key 为空时不会调用云服务；OCR 默认走本地流程并进入待确认。</p>
        <div className="form-grid">
          {SETTINGS_GROUPS.map(([key, label]) => {
            const isBoolean = BOOLEAN_SETTINGS.has(key);
            return (
              <label
                key={key}
                className={isBoolean ? "switch-setting" : key.includes("key") || key.includes("secret") || key.includes("url") || key.includes("path") ? "wide" : ""}
              >
                <span>{label}</span>
                {isBoolean ? (
                  <button
                    type="button"
                    className={props.settingsDraft[key] === "true" ? "ios-switch on" : "ios-switch"}
                    role="switch"
                    aria-checked={props.settingsDraft[key] === "true"}
                    onClick={() => setSetting(key, props.settingsDraft[key] === "true" ? "false" : "true")}
                  >
                    <span>{props.settingsDraft[key] === "true" ? "开启" : "关闭"}</span>
                  </button>
                ) : (
                  <div className="inline-input">
                    <input
                      type={key.includes("api_key") || key.includes("secret") ? "password" : "text"}
                      value={props.settingsDraft[key] || ""}
                      onChange={(event) => setSetting(key, event.target.value)}
                    />
                    {["export_directory", "backup_directory"].includes(key) && (
                      <button type="button" onClick={() => props.chooseDirectory(key)}>选择</button>
                    )}
                    {key === "excel_template_path" && (
                      <button type="button" onClick={props.chooseTemplate}>选择</button>
                    )}
                  </div>
                )}
              </label>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>案件字段管理</h2>
          <button onClick={props.addField}>新增字段</button>
        </div>
        <div className="form-grid compact">
          <label>
            <span>字段名称</span>
            <input
              value={props.fieldDraft.label}
              onChange={(event) => props.setFieldDraft({ ...props.fieldDraft, label: event.target.value })}
              placeholder="例如：保全情况"
            />
          </label>
          <label>
            <span>字段类型</span>
            <select
              value={props.fieldDraft.field_type}
              onChange={(event) => updateFieldDraftType(event.target.value)}
            >
              <option value="text">文本</option>
              <option value="long_text">长文本</option>
              <option value="date">日期</option>
              <option value="money">金额</option>
              <option value="number">数字</option>
              <option value="select">单选</option>
              <option value="multi_select">多选</option>
              <option value="contact">联系人/电话</option>
            </select>
          </label>
          {isDraftChoiceField && (
            <label className="wide">
              <span>候选项</span>
              <input
                value={props.fieldDraft.options}
                onChange={(event) => props.setFieldDraft({ ...props.fieldDraft, options: event.target.value })}
                placeholder="仅单选/多选使用，例如：财产保全，待判决，结案"
              />
            </label>
          )}
        </div>
        <div className="field-table">
          {activeFields.map((field) => (
            <div className="field-row" key={field.id}>
              <button onClick={() => move(field, -1)}>上移</button>
              <button onClick={() => move(field, 1)}>下移</button>
              <input
                defaultValue={field.label}
                onBlur={(event) => {
                  if (event.target.value !== field.label) props.saveField({ ...field, label: event.target.value });
                }}
              />
              <select
                value={field.field_type}
                onChange={(event) => props.saveField({ ...field, field_type: event.target.value as FieldType })}
              >
                <option value="text">文本</option>
                <option value="long_text">长文本</option>
                <option value="date">日期</option>
                <option value="money">金额</option>
                <option value="number">数字</option>
                <option value="select">单选</option>
                <option value="multi_select">多选</option>
                <option value="contact">联系人/电话</option>
              </select>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!field.visible}
                  onChange={(event) => props.saveField({ ...field, visible: event.target.checked ? 1 : 0 })}
                />
                显示
              </label>
              <button onClick={() => props.saveField({ ...field, active: 0 })} disabled={!!field.builtin}>
                停用
              </button>
              <span>{field.builtin ? "内置字段" : "自定义字段"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
