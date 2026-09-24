import { useEffect, useRef, useState } from "react";
import MentionText, { MentionSuggestions, TaskLine } from "./MentionText.jsx";
import { useMentionInput } from "./mentions.js";

/* WhatsApp-style internal chat for phones. The desktop layout lives in App.jsx. */

const AVATAR_COLORS = ["#25a37a", "#5b7cfa", "#e8762c", "#c2417a", "#0e9fb3", "#8a56d6", "#d9a400", "#e8192c"];
const REACTIONS = ["👍", "✅", "⚠️"];
const STATUSES = [["open", "Open"], ["in-progress", "In progress"], ["resolved", "Resolved"]];
const PRIORITIES = [["low", "Low", "green"], ["medium", "Medium", "yellow"], ["urgent", "Urgent", "red"]];

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function colorFor(name) {
  let hash = 0;
  for (const ch of String(name || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function Avatar({ name, size = 46 }) {
  return (
    <span className="wa-avatar" style={{ width: size, height: size, background: colorFor(name), fontSize: size * 0.36 }}>
      {initials(name)}
    </span>
  );
}

const Icons = {
  menu: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  back: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>,
  dots: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>,
  search: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  send: <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.4-7.5a1 1 0 000-1.8L3.4 3.6a1 1 0 00-1.4 1.1L4 11l9 1-9 1-2 6.3a1 1 0 001.4 1.1z" /></svg>,
  plus: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  clip: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l8.6-8.6a3.7 3.7 0 015.2 5.2l-8.6 8.6a1.8 1.8 0 01-2.6-2.6l7.9-7.9" /></svg>,
  newChat: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8.5 8.5 0 01-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1121 12z" /><path d="M12 8.5v7M8.5 12h7" /></svg>,
  chats: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8.5 8.5 0 01-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1121 12z" /></svg>,
  team: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><path d="M16 4.5a3.5 3.5 0 010 7M18 14.2a6.5 6.5 0 013.5 5.8" /></svg>,
  pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3l5 5-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" /></svg>,
  archive: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9M10 13h4" /></svg>,
  ticks: <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6l3 3 6-7M6.5 8.5L7 9l6-7" /></svg>,
  file: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6" /></svg>,
};

function Sheet({ title, onClose, children }) {
  return (
    <div className="wa-sheet-backdrop" onClick={onClose}>
      <div className="wa-sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="wa-sheet-handle" />
        {title && <div className="wa-sheet-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}

// Keeps the chat sized to the visible area when the iPhone keyboard opens.
function useVisualViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => {
      document.documentElement.style.setProperty("--wa-vh", `${vv.height}px`);
      document.documentElement.style.setProperty("--wa-top", `${vv.offsetTop}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--wa-vh");
      document.documentElement.style.removeProperty("--wa-top");
    };
  }, []);
}

function useLongPress(onLongPress) {
  const timer = useRef(null);
  const fired = useRef(false);
  const start = () => {
    fired.current = false;
    timer.current = setTimeout(() => { fired.current = true; onLongPress(); }, 450);
  };
  const cancel = () => clearTimeout(timer.current);
  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onContextMenu: (event) => { event.preventDefault(); cancel(); fired.current = true; onLongPress(); },
    wasLongPress: () => fired.current,
  };
}

function ChatRow({ chat, name, me, last, onOpen, onActions }) {
  const press = useLongPress(() => onActions(chat));
  const { wasLongPress, ...handlers } = press;
  return (
    <button type="button" className="wa-chat-row" {...handlers} onClick={() => { if (!wasLongPress()) onOpen(chat); }}>
      <Avatar name={name} />
      <span className="wa-row-main">
        <span className="wa-row-top">
          <b>{name}</b>
          <small className={chat.unread ? "is-unread" : ""}>{last?.time || ""}</small>
        </span>
        <span className="wa-row-bottom">
          <span className="wa-preview">
            {chat.priority === "urgent" && <em className="wa-urgent-dot" aria-label="Urgent" />}
            {last ? `${last.sender ? `${last.sender === me ? "You" : last.sender}: ` : ""}${last.text || (last.attachments?.length ? "📎 Attachment" : "")}` : "No messages yet"}
          </span>
          {chat.archived && <span className="wa-tag">Archived</span>}
          {chat.favorite && <span className="wa-star">★</span>}
          {chat.pinned && <span className="wa-pin">{Icons.pin}</span>}
          {chat.unread ? <span className="wa-badge">{chat.unread}</span> : null}
        </span>
      </span>
    </button>
  );
}

function MessageBubble({ message, outgoing, showSender, onTap, repliedTo, taggedNames, canUpdate, onSetStatus }) {
  const reactions = Object.entries(message.reactions || {}).filter(([, users]) => users?.length);
  return (
    <div className={`wa-msg ${outgoing ? "out" : "in"}`}>
      <div className={`wa-bubble wa-prio-${message.priority || "medium"}`} onClick={onTap} role="button" tabIndex={0}>
        {!outgoing && showSender && <span className="wa-sender" style={{ color: colorFor(message.sender) }}>{message.sender}</span>}
        {message.replyTo && (
          <span className="wa-quote">
            <b>{repliedTo?.sender || "Earlier message"}</b>
            <span>{repliedTo?.text || "Replying to a previous message"}</span>
          </span>
        )}
        {message.attachments?.map((file, index) => (
          file.type?.startsWith("image/") && file.dataUrl
            ? <a key={index} href={file.dataUrl} download={file.name} onClick={(e) => e.stopPropagation()}><img className="wa-image" src={file.dataUrl} alt={file.name} /></a>
            : <a key={index} className="wa-file" href={file.dataUrl || undefined} download={file.name} onClick={(e) => e.stopPropagation()}>{Icons.file}<span>{file.name}</span></a>
        ))}
        {message.text && <span className="wa-text"><MentionText text={message.text} names={taggedNames} /></span>}
        <span className="wa-meta">
          {message.priority === "urgent" && <span className="wa-status status-urgent">Urgent</span>}
          <span className="wa-time">{message.time}</span>
          {outgoing && <span className="wa-ticks">{Icons.ticks}</span>}
        </span>
        {taggedNames.length > 0 && <TaskLine message={message} taggedNames={taggedNames} canUpdate={canUpdate} onSetStatus={onSetStatus} />}
      </div>
      {reactions.length > 0 && (
        <div className="wa-reactions">{reactions.map(([emoji, users]) => <span key={emoji}>{emoji}{users.length > 1 ? ` ${users.length}` : ""}</span>)}</div>
      )}
    </div>
  );
}

export default function MobileChat({ chat: c }) {
  useVisualViewportHeight();
  const [tab, setTab] = useState("chats");
  const [sheet, setSheet] = useState(null); // { type, chat?, message? }
  const [draftTitle, setDraftTitle] = useState("");
  const [showExtras, setShowExtras] = useState(false);
  const messagesRef = useRef(null);
  const fileRef = useRef(null);

  const conversationOpen = c.pane === "conversation" && c.selectedChat;
  const chatMessages = c.selectedChat ? c.visibleMessages(c.selectedChat) : [];
  const archivedCount = c.departmentChats.filter((chat) => chat.archived).length;
  const unreadCount = c.departmentChats.filter((chat) => !chat.archived && Number(chat.unread || 0) > 0).length;

  // Stay at the latest message, like WhatsApp
  useEffect(() => {
    if (!conversationOpen || !messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [conversationOpen, c.selectedChat?.id, chatMessages.length]);

  const openChat = (chat) => {
    c.openChat(chat.id);
    setShowExtras(false);
  };

  const closeSheet = () => { setSheet(null); setDraftTitle(""); };

  const createChat = async (event) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;
    const created = await c.createChat(title);
    closeSheet();
    if (created) setTab("chats");
  };

  const renameChat = async (event) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (title) await c.updateChat(sheet.chat.id, { title });
    closeSheet();
  };

  const send = async () => {
    mention.close();
    await c.send();
    setShowExtras(false);
  };
  const inputRef = useRef(null);
  const mention = useMentionInput({ inputRef, value: c.message, setValue: c.setMessage, people: c.taggablePeople, onEnter: () => send() });
  const isGroup = c.selectedDepartment !== "Direct";

  const isOutgoing = (message) => message.sender === c.currentUserName || (c.currentUserName === "Admin" && message.sender === "You");

  return (
    <div className={`wa-app ${conversationOpen ? "show-conversation" : ""}`}>
      {/* ── LIST SCREEN ───────────────────────────────────────── */}
      <section className="wa-screen wa-list" aria-hidden={conversationOpen ? "true" : undefined}>
        <header className="wa-bar">
          <button type="button" className="wa-icon-btn" aria-label="Open menu" onClick={c.openMenu}>{Icons.menu}</button>
          <div className="wa-bar-title">
            <b>{tab === "chats" ? "Chats" : "Team"}</b>
            <small>{c.selectedDepartment}</small>
          </div>
        </header>

        <div className="wa-list-scroll">
          <div className="wa-chips" role="tablist" aria-label="Departments">
            {c.departments.map((department) => (
              <button type="button" key={department} className={c.selectedDepartment === department ? "active" : ""} onClick={() => c.setSelectedDepartment(department)}>
                {department === "Direct" ? "💬 Direct" : department}
              </button>
            ))}
          </div>

          {tab === "chats" ? (
            <>
              {c.pushState === "off" && (
                <button type="button" className="wa-notify-banner" onClick={c.turnOnNotifications}>
                  <span className="wa-notify-icon">🔔</span>
                  <span><b>Turn on notifications</b><small>Get a pop-up when someone messages you</small></span>
                </button>
              )}
              {c.pushState === "needs-install" && (
                <button type="button" className="wa-notify-banner" onClick={c.openNotifySettings}>
                  <span className="wa-notify-icon">🔔</span>
                  <span><b>Want notifications?</b><small>Tap Share → Add to Home Screen, then open Snackit Chat from your home screen</small></span>
                </button>
              )}
              {c.pushState === "denied" && (
                <button type="button" className="wa-notify-banner" onClick={c.openNotifySettings}>
                  <span className="wa-notify-icon">🔕</span>
                  <span><b>Notifications are blocked</b><small>Tap to see how to turn them back on</small></span>
                </button>
              )}
              <label className="wa-search">
                {Icons.search}
                <input value={c.search} onChange={(e) => c.setSearch(e.target.value)} placeholder="Search chats" enterKeyHint="search" />
              </label>
              <div className="wa-chips wa-filter-chips">
                {[["all", "All"], ["unread", `Unread${unreadCount ? ` ${unreadCount}` : ""}`], ["pinned", "Pinned"], ["favorites", "Favourites"]].map(([value, label]) => (
                  <button type="button" key={value} className={c.filter === value ? "active" : ""} onClick={() => c.setFilter(value)}>{label}</button>
                ))}
              </div>
              {archivedCount > 0 && (
                <button type="button" className="wa-archived-row" onClick={() => c.setShowArchived(!c.showArchived)}>
                  <span className="wa-archived-icon">{Icons.archive}</span>
                  <b>{c.showArchived ? "Hide archived" : "Archived"}</b>
                  <small>{archivedCount}</small>
                </button>
              )}
              <div className="wa-rows">
                {c.chats.length ? c.chats.map((chat) => (
                  <ChatRow key={chat.id} chat={chat} name={c.chatName(chat)} me={c.currentUserName} last={c.visibleMessages(chat).at(-1)} onOpen={openChat} onActions={(target) => setSheet({ type: "chat", chat: target })} />
                )) : (
                  <div className="wa-empty">
                    <b>No chats here yet</b>
                    <span>{c.search || c.filter !== "all" ? "Try a different search or filter." : c.selectedDepartment === "Direct" ? "Tap the green button to message someone privately." : `Tap the green button to start a ${c.selectedDepartment} chat.`}</span>
                  </div>
                )}
              </div>
              {c.chats.length > 0 && <p className="wa-hint">Press and hold a chat for more options</p>}
            </>
          ) : (
            <div className="wa-rows">
              {c.selectedDepartment === "Direct" && c.directPeople.map((person) => (
                <button type="button" className="wa-chat-row wa-member" key={person.key} onClick={() => c.startDirect(person.key)}>
                  <Avatar name={person.name} />
                  <span className="wa-row-main">
                    <span className="wa-row-top"><b>{person.name}</b></span>
                    <span className="wa-row-bottom"><span className="wa-preview">{person.role}</span></span>
                  </span>
                  <span className="wa-message-btn">Message</span>
                </button>
              ))}
              {c.selectedDepartment !== "Direct" && (c.departmentUsers.length ? c.departmentUsers.map((user) => (
                <div className="wa-chat-row wa-member" key={user.id}>
                  <Avatar name={user.name} />
                  <span className="wa-row-main">
                    <span className="wa-row-top"><b>{user.name}</b></span>
                    <span className="wa-row-bottom">
                      <span className="wa-preview">{user.role}{user.tags?.length ? ` · ${user.tags.map((t) => `#${t}`).join(" ")}` : ""}</span>
                    </span>
                  </span>
                  {String(user.id) !== c.myChatKey && <button type="button" className="wa-message-btn" onClick={() => c.startDirect(String(user.id))}>Message</button>}
                  {c.isAdmin && <button type="button" className="wa-text-danger" onClick={() => c.deleteUser(user.id)}>Remove</button>}
                </div>
              )) : <div className="wa-empty"><b>No team members</b><span>Nobody is in {c.selectedDepartment} yet.</span></div>)}
              {c.selectedDepartment !== "Direct" && (
                <>
                  <div className="wa-section-label">Other members · everyone is in this group</div>
                  {c.internalUsers.filter((user) => user.department !== c.selectedDepartment).map((user) => (
                    <div className="wa-chat-row wa-member" key={user.id}>
                      <Avatar name={user.name} />
                      <span className="wa-row-main">
                        <span className="wa-row-top"><b>{user.name}</b></span>
                        <span className="wa-row-bottom"><span className="wa-preview">{user.role} · {user.department}</span></span>
                      </span>
                      {String(user.id) !== c.myChatKey && <button type="button" className="wa-message-btn" onClick={() => c.startDirect(String(user.id))}>Message</button>}
                    </div>
                  ))}
                </>
              )}
              {c.isAdmin && (
                <form className="wa-card-form" onSubmit={c.addEmployee}>
                  <b>Add employee</b>
                  <input placeholder="Employee name" value={c.newEmployee.name} onChange={(e) => c.setNewEmployee((p) => ({ ...p, name: e.target.value }))} />
                  <select value={c.newEmployee.department} onChange={(e) => c.setNewEmployee((p) => ({ ...p, department: e.target.value }))}>
                    {c.departments.map((d) => <option key={d}>{d}</option>)}
                  </select>
                  <input placeholder="Role" value={c.newEmployee.role} onChange={(e) => c.setNewEmployee((p) => ({ ...p, role: e.target.value }))} />
                  <input placeholder="Tags, comma separated" value={c.newEmployee.tags} onChange={(e) => c.setNewEmployee((p) => ({ ...p, tags: e.target.value }))} />
                  <button type="submit" className="wa-primary-btn">Add employee</button>
                  {c.employeeCredentials && (
                    <div className="wa-credentials">
                      <b>Login created</b>
                      <span>Username: <code>{c.employeeCredentials.username}</code></span>
                      <span>Password: <code>{c.employeeCredentials.password}</code></span>
                      <small>Share securely. The password is shown only once.</small>
                    </div>
                  )}
                </form>
              )}
            </div>
          )}
        </div>

        {tab === "chats" && (
          <button type="button" className="wa-fab" aria-label="New chat" onClick={() => setSheet({ type: c.selectedDepartment === "Direct" ? "direct" : "new" })}>{Icons.newChat}</button>
        )}

        <nav className="wa-tabbar">
          <button type="button" className={tab === "chats" ? "active" : ""} onClick={() => setTab("chats")}>
            <span className="wa-tab-icon">{Icons.chats}{unreadCount > 0 && <i>{unreadCount}</i>}</span>
            Chats
          </button>
          <button type="button" className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>
            <span className="wa-tab-icon">{Icons.team}</span>
            Team
          </button>
        </nav>
      </section>

      {/* ── CONVERSATION SCREEN ───────────────────────────────── */}
      <section className="wa-screen wa-conversation" aria-hidden={conversationOpen ? undefined : "true"}>
        {c.selectedChat && <>
          <header className="wa-bar">
            <button type="button" className="wa-icon-btn" aria-label="Back to chats" onClick={() => c.setPane("list")}>{Icons.back}</button>
            <Avatar name={c.chatName(c.selectedChat)} size={38} />
            <button type="button" className="wa-bar-title wa-bar-title-btn" onClick={() => setSheet({ type: "chat", chat: c.selectedChat })}>
              <b>{c.chatName(c.selectedChat)}</b>
              <small>{c.selectedChat.type === "direct" ? "🔒 Private chat" : `Everyone · @ tags ${c.selectedChat.department}`}</small>
            </button>
            <button type="button" className="wa-icon-btn" aria-label="Chat options" onClick={() => setSheet({ type: "chat", chat: c.selectedChat })}>{Icons.dots}</button>
          </header>

          <div className="wa-messages" ref={messagesRef}>
            {c.selectedChat.priority === "urgent" && <div className="wa-system">Urgent priority chat</div>}
            {chatMessages.length ? chatMessages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                outgoing={isOutgoing(message)}
                showSender={index === 0 || chatMessages[index - 1].sender !== message.sender}
                repliedTo={message.replyTo ? chatMessages.find((m) => String(m.id) === String(message.replyTo)) : null}
                onTap={() => setSheet({ type: "message", message })}
                taggedNames={c.taggedNames(message)}
                canUpdate={c.isTaggedMe(message)}
                onSetStatus={(value) => c.updateStatus(c.selectedChat.id, message.id, value)}
              />
            )) : <div className="wa-system">No messages yet. Say hello 👋</div>}
          </div>

          <div className="wa-composer">
            {c.replyTo && (
              <div className="wa-reply-banner">
                <span><b>Replying to {c.replyTo.sender}</b>{c.replyTo.text}</span>
                <button type="button" aria-label="Cancel reply" onClick={() => c.setReplyTo(null)}>×</button>
              </div>
            )}
            {c.attachedFiles.length > 0 && (
              <div className="wa-attachments">
                {c.attachedFiles.map((file, index) => (
                  <span key={`${file.name}-${index}`}>
                    {file.name}
                    <button type="button" aria-label={`Remove ${file.name}`} onClick={() => c.setAttachedFiles((files) => files.filter((_, i) => i !== index))}>×</button>
                  </span>
                ))}
              </div>
            )}
            {showExtras && (
              <div className="wa-extras">
                <div className="wa-extra-row">
                  <span>Priority</span>
                  {PRIORITIES.map(([value, label, tone]) => (
                    <button type="button" key={value} className={`wa-priority ${tone} ${c.priority === value ? "active" : ""}`} onClick={() => c.setPriority(value)}>{label}</button>
                  ))}
                </div>
                {c.savedReplies.length > 0 && (
                  <div className="wa-extra-row">
                    <span>Quick reply</span>
                    <div className="wa-chip-scroll">
                      {c.savedReplies.map((reply) => (
                        <button type="button" key={reply.id} onClick={() => c.setMessage((v) => `${v}${v ? " " : ""}${reply.text}`)}>{reply.title}</button>
                      ))}
                    </div>
                  </div>
                )}
                <button type="button" className="wa-link" onClick={() => setSheet({ type: "saveReply" })}>+ Save a quick reply</button>
              </div>
            )}
            {mention.open && <MentionSuggestions people={mention.suggestions} department={c.selectedDepartment} onPick={mention.pick} />}
            <div className="wa-compose-row">
              <button type="button" className={`wa-round-btn wa-more ${showExtras ? "active" : ""}`} aria-label="More options" onClick={() => setShowExtras((v) => !v)}>{Icons.plus}</button>
              <div className="wa-input-pill">
                <input
                  ref={inputRef}
                  value={c.message}
                  onChange={mention.onChange}
                  onKeyDown={mention.onKeyDown}
                  onBlur={() => setTimeout(mention.close, 150)}
                  placeholder={isGroup ? "Message · @ to tag" : "Message"}
                  enterKeyHint="send"
                />
                {isGroup && <button type="button" className="wa-at" aria-label={`Tag someone from ${c.selectedDepartment}`} onClick={mention.openPicker}>@</button>}
                <button type="button" className="wa-clip" aria-label="Attach file" onClick={() => fileRef.current?.click()}>{Icons.clip}</button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  onChange={(e) => { c.setAttachedFiles((files) => [...files, ...Array.from(e.target.files || [])]); e.target.value = ""; }}
                />
              </div>
              <button type="button" className="wa-round-btn wa-send" aria-label="Send" onClick={send} disabled={!c.message.trim() && !c.attachedFiles.length}>{Icons.send}</button>
            </div>
          </div>
        </>}
      </section>

      {/* ── SHEETS ────────────────────────────────────────────── */}
      {sheet?.type === "new" && (
        <Sheet title={`New ${c.selectedDepartment} chat`} onClose={closeSheet}>
          <form className="wa-sheet-form" onSubmit={createChat}>
            <input autoFocus value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Chat name, e.g. Nutanix refill issues" />
            <button type="submit" className="wa-primary-btn" disabled={!draftTitle.trim()}>Create chat</button>
          </form>
        </Sheet>
      )}

      {sheet?.type === "direct" && (
        <Sheet title="Message someone" onClose={closeSheet}>
          <div className="wa-sheet-list">
            {c.directPeople.map((person) => (
              <button type="button" key={person.key} className="wa-chat-row wa-member" onClick={() => { closeSheet(); c.startDirect(person.key); }}>
                <Avatar name={person.name} />
                <span className="wa-row-main">
                  <span className="wa-row-top"><b>{person.name}</b></span>
                  <span className="wa-row-bottom"><span className="wa-preview">{person.role}</span></span>
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {sheet?.type === "rename" && (
        <Sheet title="Rename chat" onClose={closeSheet}>
          <form className="wa-sheet-form" onSubmit={renameChat}>
            <input autoFocus value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
            <button type="submit" className="wa-primary-btn" disabled={!draftTitle.trim()}>Save</button>
          </form>
        </Sheet>
      )}

      {sheet?.type === "saveReply" && (
        <Sheet title="Save a quick reply" onClose={closeSheet}>
          <form className="wa-sheet-form" onSubmit={async (e) => { await c.saveReply(e); closeSheet(); }}>
            <input autoFocus placeholder="Title" value={c.replyDraft.title} onChange={(e) => c.setReplyDraft((d) => ({ ...d, title: e.target.value }))} />
            <input placeholder="Reply text" value={c.replyDraft.text} onChange={(e) => c.setReplyDraft((d) => ({ ...d, text: e.target.value }))} />
            <button type="submit" className="wa-primary-btn">Save</button>
          </form>
        </Sheet>
      )}

      {sheet?.type === "chat" && (() => {
        const target = c.departmentChats.find((chat) => chat.id === sheet.chat.id) || sheet.chat;
        const act = (updates) => { c.updateChat(target.id, updates); closeSheet(); };
        return (
          <Sheet title={c.chatName(target)} onClose={closeSheet}>
            <div className="wa-sheet-section">
              <span>Priority</span>
              <div className="wa-sheet-chips">
                {PRIORITIES.map(([value, label, tone]) => (
                  <button type="button" key={value} className={`wa-priority ${tone} ${(target.priority || "medium") === value ? "active" : ""}`} onClick={() => act({ priority: value })}>{label}</button>
                ))}
              </div>
            </div>
            <button type="button" className="wa-sheet-item" onClick={() => act({ pinned: !target.pinned })}>{target.pinned ? "Unpin chat" : "Pin chat"}</button>
            <button type="button" className="wa-sheet-item" onClick={() => act({ favorite: !target.favorite })}>{target.favorite ? "Remove from favourites" : "Add to favourites"}</button>
            <button type="button" className="wa-sheet-item" onClick={() => { act({ archived: !target.archived }); if (!target.archived) c.setPane("list"); }}>{target.archived ? "Unarchive chat" : "Archive chat"}</button>
            {c.isAdmin && target.type !== "direct" && <button type="button" className="wa-sheet-item" onClick={() => { setDraftTitle(target.title); setSheet({ type: "rename", chat: target }); }}>Rename chat</button>}
            {c.isAdmin && <button type="button" className="wa-sheet-item danger" onClick={() => { closeSheet(); c.setPane("list"); c.deleteChat(target.id); }}>Delete chat</button>}
          </Sheet>
        );
      })()}

      {sheet?.type === "message" && c.selectedChat && (() => {
        const message = chatMessages.find((m) => m.id === sheet.message.id) || sheet.message;
        const chatId = c.selectedChat.id;
        const canChangeStatus = c.isTaggedMe(message);
        return (
          <Sheet onClose={closeSheet}>
            <div className="wa-reaction-bar">
              {REACTIONS.map((emoji) => (
                <button type="button" key={emoji} onClick={() => { c.updateMessage(chatId, message.id, { reaction: emoji }); closeSheet(); }}>
                  {emoji}<small>{message.reactions?.[emoji]?.length || ""}</small>
                </button>
              ))}
            </div>
            <button type="button" className="wa-sheet-item" onClick={() => { c.setReplyTo(message); closeSheet(); inputRef.current?.focus(); }}>Reply</button>
            {canChangeStatus && (
              <div className="wa-sheet-section">
                <span>Status</span>
                <div className="wa-sheet-chips">
                  {STATUSES.map(([value, label]) => (
                    <button type="button" key={value} className={(message.status || "open") === value ? "active" : ""} onClick={() => { c.updateStatus(chatId, message.id, value); closeSheet(); }}>{label}</button>
                  ))}
                </div>
              </div>
            )}
            {message.text && <button type="button" className="wa-sheet-item" onClick={() => { navigator.clipboard?.writeText(message.text).catch(() => null); closeSheet(); }}>Copy text</button>}
          </Sheet>
        );
      })()}
    </div>
  );
}
