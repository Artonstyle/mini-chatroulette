(function () {
  const supabaseGlobal = window.supabase;
  const supabaseUrl = window.MINI_CHATROULETTE_SUPABASE_URL;
  const supabaseAnonKey = window.MINI_CHATROULETTE_SUPABASE_ANON_KEY;

  if (!supabaseGlobal || !supabaseUrl || !supabaseAnonKey) return;

  const client = supabaseGlobal.createClient(supabaseUrl, supabaseAnonKey);

  const body = document.body;
  const mobileHub = document.getElementById("mobileHub");
  const panes = Array.from(document.querySelectorAll("[data-mobile-pane]"));
  const statusComposer = document.getElementById("statusComposer");
  const statusTextInput = document.getElementById("statusTextInput");
  const statusMediaUrlInput = document.getElementById("statusMediaUrlInput");
  const statusPublishBtn = document.getElementById("statusPublishBtn");
  const statusList = document.getElementById("statusList");
  const callLogList = document.getElementById("callLogList");
  const directChatSearch = document.getElementById("directChatSearch");
  const directChatList = document.getElementById("directChatList");
  const directChatHeader = document.getElementById("directChatHeader");
  const directMessageList = document.getElementById("directMessageList");
  const directMessageForm = document.getElementById("directMessageForm");
  const directMessageInput = document.getElementById("directMessageInput");
  const directMessageSend = document.getElementById("directMessageSend");

  let currentSession = null;
  let profileMap = new Map();
  let profiles = [];
  let activeContactId = null;

  function isMobile() {
    return window.innerWidth <= 800;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setHubOpen(open) {
    if (!mobileHub) return;
    body.classList.toggle("mobile-pane-open", open);
    mobileHub.hidden = !open;
  }

  function setActivePane(tabName) {
    const openPane = tabName === "status" || tabName === "calls" || tabName === "chat";
    setHubOpen(openPane);

    panes.forEach((pane) => {
      pane.classList.toggle("active", pane.dataset.mobilePane === tabName && openPane);
    });
  }

  function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("de-DE");
  }

  function getDisplayName(profile) {
    if (!profile) return "Unbekannt";
    return profile.display_name || profile.username || profile.phone_number || "Unbekannt";
  }

  function getProfileMeta(profile) {
    if (!profile) return "Kein Profil";
    return profile.phone_number || profile.username || "Kein Telefon hinterlegt";
  }

  function requireLoginMessage(text) {
    return `<div class="mobile-empty-state">${escapeHtml(text)}</div>`;
  }

  async function loadProfiles() {
    if (!currentSession?.user) {
      profiles = [];
      profileMap = new Map();
      return;
    }

    const { data, error } = await client
      .from("profiles")
      .select("id,username,display_name,phone_number,is_banned")
      .neq("id", currentSession.user.id)
      .eq("is_banned", false)
      .order("display_name", { ascending: true });

    if (error) {
      profiles = [];
      profileMap = new Map();
      throw error;
    }

    profiles = data || [];
    profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  }

  function renderChatContacts() {
    if (!directChatList) return;

    if (!currentSession?.user) {
      directChatList.innerHTML = requireLoginMessage("Melde dich an, um direkte Chats zu nutzen.");
      return;
    }

    const query = directChatSearch?.value?.trim().toLowerCase() || "";
    const filtered = profiles.filter((profile) => {
      const haystack = `${profile.display_name || ""} ${profile.username || ""} ${profile.phone_number || ""}`.toLowerCase();
      return haystack.includes(query);
    });

    if (!filtered.length) {
      directChatList.innerHTML = '<div class="mobile-empty-state">Keine Kontakte gefunden.</div>';
      return;
    }

    directChatList.innerHTML = filtered.map((profile) => `
      <button class="mobile-chat-contact ${profile.id === activeContactId ? "active" : ""}" type="button" data-contact-id="${profile.id}">
        <strong>${escapeHtml(getDisplayName(profile))}</strong>
        <span>${escapeHtml(getProfileMeta(profile))}</span>
      </button>
    `).join("");

    directChatList.querySelectorAll("[data-contact-id]").forEach((button) => {
      button.addEventListener("click", () => {
        activeContactId = button.dataset.contactId;
        renderChatContacts();
        void loadDirectMessages();
      });
    });
  }

  async function loadDirectMessages() {
    if (!directMessageList || !directChatHeader) return;

    if (!currentSession?.user) {
      directChatHeader.innerHTML = "<strong>Kontakt wählen</strong><span>Melde dich an, um Nachrichten zu sehen.</span>";
      directMessageList.innerHTML = requireLoginMessage("Noch keine Nachrichten.");
      directMessageInput.disabled = true;
      directMessageSend.disabled = true;
      return;
    }

    if (!activeContactId) {
      directChatHeader.innerHTML = "<strong>Kontakt wählen</strong><span>Wähle links einen registrierten Nutzer aus.</span>";
      directMessageList.innerHTML = '<div class="mobile-empty-state">Noch keine Nachrichten.</div>';
      directMessageInput.disabled = true;
      directMessageSend.disabled = true;
      return;
    }

    const activeProfile = profileMap.get(activeContactId);
    directChatHeader.innerHTML = `
      <strong>${escapeHtml(getDisplayName(activeProfile))}</strong>
      <span>${escapeHtml(getProfileMeta(activeProfile))}</span>
    `;

    directMessageInput.disabled = false;
    directMessageSend.disabled = false;

    const userId = currentSession.user.id;
    const { data, error } = await client
      .from("direct_messages")
      .select("id,sender_id,recipient_id,message,created_at")
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${activeContactId}),and(sender_id.eq.${activeContactId},recipient_id.eq.${userId})`)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      directMessageList.innerHTML = requireLoginMessage("Direktnachrichten konnten noch nicht geladen werden. Führe zuerst die neue SQL-Datei in Supabase aus.");
      return;
    }

    if (!data?.length) {
      directMessageList.innerHTML = '<div class="mobile-empty-state">Noch keine Nachrichten in diesem Chat.</div>';
      return;
    }

    directMessageList.innerHTML = data.map((message) => `
      <article class="mobile-direct-message ${message.sender_id === userId ? "me" : ""}">
        <div>${escapeHtml(message.message)}</div>
        <span class="meta">${formatDate(message.created_at)}</span>
      </article>
    `).join("");

    directMessageList.scrollTop = directMessageList.scrollHeight;
  }

  async function sendDirectMessage(event) {
    event.preventDefault();

    if (!currentSession?.user || !activeContactId) return;
    const text = directMessageInput?.value?.trim();
    if (!text) return;

    const { error } = await client.from("direct_messages").insert({
      sender_id: currentSession.user.id,
      recipient_id: activeContactId,
      message: text
    });

    if (error) {
      directMessageList.innerHTML = requireLoginMessage("Nachricht konnte nicht gesendet werden. Bitte prüfe, ob die SQL-Datei in Supabase ausgeführt wurde.");
      return;
    }

    directMessageInput.value = "";
    await loadDirectMessages();
  }

  async function loadStatuses() {
    if (!statusList) return;

    if (!currentSession?.user) {
      statusList.innerHTML = requireLoginMessage("Melde dich an, um Statusmeldungen zu sehen.");
      return;
    }

    const { data, error } = await client
      .from("status_posts")
      .select("id,user_id,text_content,media_url,media_type,created_at,expires_at")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      statusList.innerHTML = requireLoginMessage("Status konnte noch nicht geladen werden. Führe zuerst die neue SQL-Datei in Supabase aus.");
      return;
    }

    if (!data?.length) {
      statusList.innerHTML = '<div class="mobile-empty-state">Noch keine Statusmeldungen.</div>';
      return;
    }

    statusList.innerHTML = data.map((item) => {
      const owner = profileMap.get(item.user_id);
      const media = item.media_url
        ? `<div class="mobile-status-media">${item.media_type === "video"
            ? `<video src="${escapeHtml(item.media_url)}" controls playsinline></video>`
            : `<img src="${escapeHtml(item.media_url)}" alt="Status von ${escapeHtml(getDisplayName(owner))}">`
          }</div>`
        : "";

      return `
        <article class="mobile-status-item">
          <strong>${escapeHtml(getDisplayName(owner))}</strong>
          <span>${escapeHtml(getProfileMeta(owner))}</span>
          ${item.text_content ? `<span>${escapeHtml(item.text_content)}</span>` : ""}
          ${media}
          <span>Ablauf: ${formatDate(item.expires_at)}</span>
        </article>
      `;
    }).join("");
  }

  async function publishStatus(event) {
    event.preventDefault();

    if (!currentSession?.user) return;
    const text = statusTextInput?.value?.trim() || null;
    const mediaUrl = statusMediaUrlInput?.value?.trim() || null;
    const mediaType = mediaUrl
      ? (/\.(mp4|webm|ogg)(\?|$)/i.test(mediaUrl) ? "video" : "image")
      : null;

    if (!text && !mediaUrl) return;

    const { error } = await client.from("status_posts").insert({
      user_id: currentSession.user.id,
      text_content: text,
      media_url: mediaUrl,
      media_type: mediaType
    });

    if (error) {
      statusList.innerHTML = requireLoginMessage("Status konnte nicht gepostet werden. Bitte prüfe die neue SQL-Datei in Supabase.");
      return;
    }

    if (statusTextInput) statusTextInput.value = "";
    if (statusMediaUrlInput) statusMediaUrlInput.value = "";
    await loadStatuses();
  }

  async function loadCalls() {
    if (!callLogList) return;

    if (!currentSession?.user) {
      callLogList.innerHTML = requireLoginMessage("Melde dich an, um Anrufe zu sehen.");
      return;
    }

    const userId = currentSession.user.id;
    const { data, error } = await client
      .from("call_logs")
      .select("id,caller_id,recipient_id,call_type,status,started_at,ended_at,created_at")
      .or(`caller_id.eq.${userId},recipient_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      callLogList.innerHTML = requireLoginMessage("Anrufliste konnte noch nicht geladen werden. Führe zuerst die neue SQL-Datei in Supabase aus.");
      return;
    }

    if (!data?.length) {
      callLogList.innerHTML = '<div class="mobile-empty-state">Noch keine Anrufe vorhanden.</div>';
      return;
    }

    callLogList.innerHTML = data.map((item) => {
      const partnerId = item.caller_id === userId ? item.recipient_id : item.caller_id;
      const partner = profileMap.get(partnerId);
      const label = item.call_type === "video" ? "Videoanruf" : "Sprachanruf";
      return `
        <article class="mobile-call-item">
          <strong>${escapeHtml(getDisplayName(partner))}</strong>
          <span>${label} · ${escapeHtml(item.status || "unbekannt")}</span>
          <span>${formatDate(item.created_at || item.started_at)}</span>
        </article>
      `;
    }).join("");
  }

  async function refreshAll() {
    try {
      await loadProfiles();
      renderChatContacts();
      await Promise.all([
        loadStatuses(),
        loadCalls(),
        loadDirectMessages()
      ]);
    } catch (_) {
      renderChatContacts();
      await Promise.allSettled([
        loadStatuses(),
        loadCalls(),
        loadDirectMessages()
      ]);
    }
  }

  window.addEventListener("mini-chatroulette:mobile-tab", (event) => {
    const tab = event.detail?.tab || "chats";
    setActivePane(tab);
    if (tab === "status" || tab === "calls" || tab === "chat") {
      void refreshAll();
    }
  });

  directChatSearch?.addEventListener("input", renderChatContacts);
  directMessageForm?.addEventListener("submit", sendDirectMessage);
  statusComposer?.addEventListener("submit", publishStatus);

  client.auth.onAuthStateChange(async (_event, session) => {
    currentSession = session;
    activeContactId = null;
    await refreshAll();
  });

  client.auth.getSession().then(async ({ data }) => {
    currentSession = data.session;
    await refreshAll();
  });
})();
