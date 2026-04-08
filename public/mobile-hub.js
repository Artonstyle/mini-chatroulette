(function () {
  const STATUS_MEDIA_BUCKET = "status-media";
  const DEMO_CONTACT_ID = "__demo_contact__";

  const client = window.getMiniChatrouletteSupabaseClient?.();

  if (!client) return;

  const body = document.body;
  const mobileHub = document.getElementById("mobileHub");
  const panes = Array.from(document.querySelectorAll("[data-mobile-pane]"));

  const statusRail = document.getElementById("statusRail");
  const statusList = document.getElementById("statusList");
  const statusViewer = document.getElementById("statusViewer");
  const statusViewerClose = document.getElementById("statusViewerClose");
  const statusViewerName = document.getElementById("statusViewerName");
  const statusViewerMeta = document.getElementById("statusViewerMeta");
  const statusViewerDelete = document.getElementById("statusViewerDelete");
  const statusViewerImage = document.getElementById("statusViewerImage");
  const statusViewerVideo = document.getElementById("statusViewerVideo");
  const statusViewerText = document.getElementById("statusViewerText");
  const statusEditor = document.getElementById("statusEditor");
  const statusEditorClose = document.getElementById("statusEditorClose");
  const statusEditorImage = document.getElementById("statusEditorImage");
  const statusEditorVideo = document.getElementById("statusEditorVideo");
  const statusDrawCanvas = document.getElementById("statusDrawCanvas");
  const statusTextOverlay = document.getElementById("statusTextOverlay");
  const statusEditorToolPanel = document.getElementById("statusEditorToolPanel");
  const statusTextTool = document.getElementById("statusTextTool");
  const statusTextToolInput = document.getElementById("statusTextToolInput");
  const statusTextToolApply = document.getElementById("statusTextToolApply");
  const statusDrawTool = document.getElementById("statusDrawTool");
  const statusDrawClear = document.getElementById("statusDrawClear");
  const statusDrawDone = document.getElementById("statusDrawDone");
  const statusDrawColors = Array.from(document.querySelectorAll(".mobile-status-color"));
  const statusEditorCaption = document.getElementById("statusEditorCaption");
  const statusPublishBtn = document.getElementById("statusPublishBtn");
  const statusEditorTools = Array.from(document.querySelectorAll(".mobile-status-editor-tool"));

  const callLogList = document.getElementById("callLogList");

  const directChatSearch = document.getElementById("directChatSearch");
  const directChatList = document.getElementById("directChatList");
  const directChatListView = document.getElementById("directChatListView");
  const directChatThreadView = document.getElementById("directChatThreadView");
  const directChatBack = document.getElementById("directChatBack");
  const directChatTitle = document.getElementById("directChatTitle");
  const directChatMeta = document.getElementById("directChatMeta");
  const directChatHeader = document.getElementById("directChatHeader");
  const directMessageList = document.getElementById("directMessageList");
  const directMessageForm = document.getElementById("directMessageForm");
  const directMessageInput = document.getElementById("directMessageInput");
  const directMessageSend = document.getElementById("directMessageSend");
  const directChatFab = document.querySelector(".mobile-chat-fab");

  let currentSession = null;
  let profileMap = new Map();
  let profiles = [];
  let statusItems = [];
  let chatPreviewMap = new Map();
  let activeContactId = null;
  let activeStatusId = null;
  let selectedStatusFile = null;
  let selectedStatusPreviewUrl = null;
  let drawEnabled = false;
  let drawColor = "#ffffff";
  let isDrawing = false;
  let textOverlayState = { text: "", x: 50, y: 28 };
  let textDragging = false;
  let textDragOffset = { x: 0, y: 0 };
  let realtimeChannel = null;
  let demoMessages = [
    {
      id: "demo-1",
      sender_id: DEMO_CONTACT_ID,
      recipient_id: "me",
      message: "Hey, das ist ein Demo-Chat zum Testen deiner Chat-Ansicht.",
      created_at: new Date(Date.now() - 1000 * 60 * 22).toISOString()
    },
    {
      id: "demo-2",
      sender_id: "me",
      recipient_id: DEMO_CONTACT_ID,
      message: "Perfekt, dann kann ich Liste, Verlauf und Senden testen.",
      created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString()
    },
    {
      id: "demo-3",
      sender_id: DEMO_CONTACT_ID,
      recipient_id: "me",
      message: "Genau. Diese Demo bleibt lokal und ist nur für deinen Test da.",
      created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString()
    }
  ];

  function getStatusMediaInput() {
    return document.getElementById("statusMediaFileInline");
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
    const openPane = tabName === "status" || tabName === "calls" || tabName === "chat" || tabName === "settings";
    setHubOpen(openPane);
    body.classList.toggle("mobile-status-mode", tabName === "status");
    body.classList.toggle("mobile-chat-mode", tabName === "chat");

    panes.forEach((pane) => {
      pane.classList.toggle("active", pane.dataset.mobilePane === tabName && openPane);
    });
  }

  function updateChatView() {
    const threadOpen = Boolean(activeContactId);
    if (directChatListView) directChatListView.hidden = threadOpen;
    if (directChatThreadView) directChatThreadView.hidden = !threadOpen;
  }

  function syncTextOverlay() {
    if (!statusTextOverlay) return;
    if (!textOverlayState.text) {
      statusTextOverlay.hidden = true;
      statusTextOverlay.textContent = "";
      return;
    }
    statusTextOverlay.hidden = false;
    statusTextOverlay.textContent = textOverlayState.text;
    statusTextOverlay.style.left = `${textOverlayState.x}%`;
    statusTextOverlay.style.top = `${textOverlayState.y}%`;
  }

  function hideEditorTools() {
    if (statusEditorToolPanel) statusEditorToolPanel.hidden = true;
    if (statusTextTool) statusTextTool.hidden = true;
    if (statusDrawTool) statusDrawTool.hidden = true;
    drawEnabled = false;
    if (statusDrawCanvas) statusDrawCanvas.style.pointerEvents = "none";
  }

  function resizeDrawCanvas() {
    if (!statusDrawCanvas || !statusEditorImage || statusEditorImage.hidden) return;
    const rect = statusEditorImage.getBoundingClientRect();
    statusDrawCanvas.width = Math.max(1, Math.round(rect.width));
    statusDrawCanvas.height = Math.max(1, Math.round(rect.height));
  }

  function clearDrawCanvas() {
    if (!statusDrawCanvas) return;
    const ctx = statusDrawCanvas.getContext("2d");
    ctx.clearRect(0, 0, statusDrawCanvas.width, statusDrawCanvas.height);
  }

  function getCanvasPoint(event) {
    const rect = statusDrawCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (statusDrawCanvas.width / rect.width),
      y: (event.clientY - rect.top) * (statusDrawCanvas.height / rect.height)
    };
  }

  function startDraw(event) {
    if (!drawEnabled || !statusDrawCanvas) return;
    isDrawing = true;
    const point = getCanvasPoint(event);
    const ctx = statusDrawCanvas.getContext("2d");
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function moveDraw(event) {
    if (!drawEnabled || !isDrawing || !statusDrawCanvas) return;
    const point = getCanvasPoint(event);
    const ctx = statusDrawCanvas.getContext("2d");
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function stopDraw() {
    isDrawing = false;
  }

  function startTextDrag(event) {
    if (!statusTextOverlay || statusTextOverlay.hidden) return;
    textDragging = true;
    const rect = statusTextOverlay.getBoundingClientRect();
    textDragOffset.x = event.clientX - rect.left;
    textDragOffset.y = event.clientY - rect.top;
    statusTextOverlay.style.cursor = "grabbing";
  }

  function moveTextDrag(event) {
    if (!textDragging || !statusEditorImage || !statusTextOverlay) return;
    const rect = statusEditorImage.getBoundingClientRect();
    const x = ((event.clientX - rect.left - textDragOffset.x + statusTextOverlay.offsetWidth / 2) / rect.width) * 100;
    const y = ((event.clientY - rect.top - textDragOffset.y + statusTextOverlay.offsetHeight / 2) / rect.height) * 100;
    textOverlayState.x = Math.max(10, Math.min(90, x));
    textOverlayState.y = Math.max(10, Math.min(90, y));
    syncTextOverlay();
  }

  function stopTextDrag() {
    textDragging = false;
    if (statusTextOverlay) statusTextOverlay.style.cursor = "grab";
  }

  function closeStatusEditor() {
    hideEditorTools();
    if (statusEditor) statusEditor.hidden = true;
    if (statusEditorImage) {
      statusEditorImage.hidden = true;
      statusEditorImage.removeAttribute("src");
    }
    if (statusEditorVideo) {
      statusEditorVideo.hidden = true;
      statusEditorVideo.pause();
      statusEditorVideo.removeAttribute("src");
      statusEditorVideo.load();
    }
    if (selectedStatusPreviewUrl) {
      URL.revokeObjectURL(selectedStatusPreviewUrl);
      selectedStatusPreviewUrl = null;
    }
    if (statusEditorCaption) statusEditorCaption.value = "";
    textOverlayState = { text: "", x: 50, y: 28 };
    syncTextOverlay();
    clearDrawCanvas();
  }

  function resetStatusSelection() {
    selectedStatusFile = null;
    const statusMediaInput = getStatusMediaInput();
    if (statusMediaInput) statusMediaInput.value = "";
    closeStatusEditor();
  }

  function openStatusEditorForFile(file) {
    if (!file || !statusEditor) return;

    closeStatusViewer();
    closeStatusEditor();
    selectedStatusFile = file;
    selectedStatusPreviewUrl = URL.createObjectURL(file);

    if (file.type.startsWith("video/")) {
      if (statusEditorVideo) {
        statusEditorVideo.src = selectedStatusPreviewUrl;
        statusEditorVideo.hidden = false;
      }
    } else if (statusEditorImage) {
      statusEditorImage.src = selectedStatusPreviewUrl;
      statusEditorImage.hidden = false;
      statusEditorImage.onload = () => {
        resizeDrawCanvas();
        clearDrawCanvas();
      };
    }

    statusEditor.hidden = false;
    resizeDrawCanvas();
  }

  function pressStatusAddCard() {
    const statusComposerToggle = document.getElementById("statusComposerToggle");
    if (!statusComposerToggle) return;
    statusComposerToggle.classList.add("is-pressed");
    window.setTimeout(() => statusComposerToggle.classList.remove("is-pressed"), 140);
  }

  function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("de-DE");
  }

  function formatChatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    const now = new Date();
    return date.toDateString() === now.toDateString()
      ? date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  }

  function formatStatusAge(value) {
    if (!value) return "";
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    const diffHours = Math.max(1, Math.floor(diffMs / 3600000));
    return `vor ${diffHours} Std.`;
  }

  function getDisplayName(profile) {
    if (!profile) return "Unbekannt";
    return profile.display_name || profile.username || profile.phone_number || "Unbekannt";
  }

  function getProfileMeta(profile) {
    if (!profile) return "Kein Profil";
    return profile.phone_number || profile.username || "Kein Telefon hinterlegt";
  }

  function getInitials(profile) {
    const name = getDisplayName(profile).trim();
    if (!name) return "?";
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  function getDemoProfile() {
    return {
      id: DEMO_CONTACT_ID,
      username: "demo.chat",
      display_name: "Demo Chat",
      phone_number: "Nur zum Testen",
      avatar_url: "",
      is_demo: true
    };
  }

  function renderAvatarMarkup(profile) {
    const avatarUrl = String(profile?.avatar_url || "").trim();
    if (avatarUrl) {
      return `<span class="mobile-chat-avatar has-image"><img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(getDisplayName(profile))}"></span>`;
    }
    return `<span class="mobile-chat-avatar">${escapeHtml(getInitials(profile))}</span>`;
  }

  function requireLoginMessage(text) {
    return `<div class="mobile-empty-state">${escapeHtml(text)}</div>`;
  }

  function closeStatusViewer() {
    if (!statusViewer) return;
    activeStatusId = null;
    statusViewer.hidden = true;
    if (statusViewerDelete) statusViewerDelete.hidden = true;
    if (statusViewerVideo) {
      statusViewerVideo.pause();
      statusViewerVideo.removeAttribute("src");
      statusViewerVideo.load();
    }
  }

  function openStatusViewer(statusId) {
    const item = statusItems.find((entry) => entry.id === statusId);
    if (!item || !statusViewer) return;
    activeStatusId = statusId;

    const owner = profileMap.get(item.user_id);
    if (statusViewerName) statusViewerName.textContent = getDisplayName(owner);
    if (statusViewerMeta) statusViewerMeta.textContent = formatStatusAge(item.created_at);
    if (statusViewerDelete) {
      statusViewerDelete.hidden = item.user_id !== currentSession?.user?.id;
    }

    if (statusViewerImage) {
      statusViewerImage.hidden = true;
      statusViewerImage.removeAttribute("src");
    }
    if (statusViewerVideo) {
      statusViewerVideo.hidden = true;
      statusViewerVideo.pause();
      statusViewerVideo.removeAttribute("src");
      statusViewerVideo.load();
    }
    if (statusViewerText) {
      statusViewerText.hidden = true;
      statusViewerText.textContent = "";
    }

    if (item.media_url) {
      if (item.media_type === "video" && statusViewerVideo) {
        statusViewerVideo.src = item.media_url;
        statusViewerVideo.hidden = false;
      } else if (statusViewerImage) {
        statusViewerImage.src = item.media_url;
        statusViewerImage.hidden = false;
      }
    } else if (statusViewerText) {
      statusViewerText.textContent = item.text_content || "Kein Inhalt";
      statusViewerText.hidden = false;
    }

    statusViewer.hidden = false;
  }

  function getStoragePathFromUrl(url) {
    if (!url || !url.includes(`/storage/v1/object/public/${STATUS_MEDIA_BUCKET}/`)) return null;
    const marker = `/storage/v1/object/public/${STATUS_MEDIA_BUCKET}/`;
    const index = url.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(url.slice(index + marker.length));
  }

  async function uploadStatusMedia(file) {
    const extension = (file.name.split(".").pop() || "bin").toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const objectPath = `${currentSession.user.id}/${safeName}`;

    const { error: uploadError } = await client.storage
      .from(STATUS_MEDIA_BUCKET)
      .upload(objectPath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined
      });

    if (uploadError) throw uploadError;

    const { data } = client.storage.from(STATUS_MEDIA_BUCKET).getPublicUrl(objectPath);
    return {
      url: data.publicUrl,
      type: file.type.startsWith("video/") ? "video" : "image"
    };
  }

  async function buildEditedStatusFile() {
    if (!selectedStatusFile || selectedStatusFile.type.startsWith("video/")) {
      return selectedStatusFile;
    }

    const imageUrl = selectedStatusPreviewUrl || URL.createObjectURL(selectedStatusFile);
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    if (statusDrawCanvas && statusDrawCanvas.width && statusDrawCanvas.height) {
      ctx.drawImage(statusDrawCanvas, 0, 0, canvas.width, canvas.height);
    }

    if (textOverlayState.text) {
      ctx.font = "800 64px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 10;
      const x = (textOverlayState.x / 100) * canvas.width;
      const y = (textOverlayState.y / 100) * canvas.height;
      ctx.strokeText(textOverlayState.text, x, y);
      ctx.fillText(textOverlayState.text, x, y);
    }

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
    return new File([blob], `status-${Date.now()}.png`, { type: "image/png" });
  }

  async function loadProfiles() {
    if (!currentSession?.user) {
      profiles = [];
      profileMap = new Map();
      return;
    }

    const { data, error } = await client
      .from("profiles")
      .select("id,username,display_name,phone_number,avatar_url,is_banned")
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

  async function loadChatPreviews() {
    if (!currentSession?.user) {
      chatPreviewMap = new Map();
      return;
    }

    const userId = currentSession.user.id;
    const { data, error } = await client
      .from("direct_messages")
      .select("sender_id,recipient_id,message,created_at,read_at")
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      chatPreviewMap = new Map();
      return;
    }

    const nextMap = new Map();
    for (const item of data || []) {
      const partnerId = item.sender_id === userId ? item.recipient_id : item.sender_id;
      if (!partnerId || nextMap.has(partnerId)) continue;
      const unreadCount = (data || []).filter((entry) => (
        entry.sender_id === partnerId &&
        entry.recipient_id === userId &&
        !entry.read_at
      )).length;
      nextMap.set(partnerId, { ...item, unreadCount });
    }
    chatPreviewMap = nextMap;
  }

  function renderChatContacts() {
    if (!directChatList) return;

    const query = directChatSearch?.value?.trim().toLowerCase() || "";
    const contactPool = [getDemoProfile(), ...profiles];
    const filtered = contactPool.filter((profile) => {
      const haystack = `${profile.display_name || ""} ${profile.username || ""} ${profile.phone_number || ""}`.toLowerCase();
      return haystack.includes(query);
    });

    filtered.sort((a, b) => {
      const previewA = chatPreviewMap.get(a.id);
      const previewB = chatPreviewMap.get(b.id);
      const timeA = previewA?.created_at ? new Date(previewA.created_at).getTime() : 0;
      const timeB = previewB?.created_at ? new Date(previewB.created_at).getTime() : 0;
      if (a.id === DEMO_CONTACT_ID) return -1;
      if (b.id === DEMO_CONTACT_ID) return 1;
      return timeB - timeA || getDisplayName(a).localeCompare(getDisplayName(b), "de");
    });

    if (!filtered.length) {
      directChatList.innerHTML = '<div class="mobile-empty-state">Keine Kontakte gefunden.</div>';
      return;
    }

    directChatList.innerHTML = filtered.map((profile) => {
      const preview = profile.id === DEMO_CONTACT_ID
        ? {
            message: demoMessages[demoMessages.length - 1]?.message || "Demo-Nachricht",
            created_at: demoMessages[demoMessages.length - 1]?.created_at || new Date().toISOString(),
            unreadCount: 0
          }
        : chatPreviewMap.get(profile.id);
      return `
        <button class="mobile-chat-contact ${profile.id === activeContactId ? "active" : ""}" type="button" data-contact-id="${profile.id}">
          ${renderAvatarMarkup(profile)}
          <span class="mobile-chat-contact-copy">
            <span class="mobile-chat-contact-top">
              <strong>${escapeHtml(getDisplayName(profile))}</strong>
              <time>${escapeHtml(formatChatTime(preview?.created_at))}</time>
            </span>
            <span class="mobile-chat-contact-bottom">
              <span class="mobile-chat-contact-snippet">${escapeHtml(preview?.message || getProfileMeta(profile))}</span>
              ${preview?.unreadCount ? `<span class="mobile-chat-unread-badge">${preview.unreadCount > 9 ? "9+" : preview.unreadCount}</span>` : ""}
            </span>
          </span>
        </button>
      `;
    }).join("");

    directChatList.querySelectorAll("[data-contact-id]").forEach((button) => {
      button.addEventListener("click", () => {
        activeContactId = button.dataset.contactId;
        updateChatView();
        renderChatContacts();
        void loadDirectMessages();
      });
    });
  }

  async function loadDirectMessages() {
    if (!directMessageList || !directChatHeader) return;

    if (!activeContactId) {
      if (directChatTitle) directChatTitle.textContent = "Kontakt wählen";
      if (directChatMeta) directChatMeta.textContent = "Wähle einen registrierten Nutzer aus.";
      directChatHeader.innerHTML = "<strong>Kontakt wählen</strong><span>Wähle einen registrierten Nutzer aus.</span>";
      directMessageList.innerHTML = '<div class="mobile-empty-state">Noch keine Nachrichten.</div>';
      directMessageInput.disabled = true;
      directMessageSend.disabled = true;
      updateChatView();
      return;
    }

    if (activeContactId === DEMO_CONTACT_ID) {
      const demoProfile = getDemoProfile();
      if (directChatTitle) directChatTitle.textContent = getDisplayName(demoProfile);
      if (directChatMeta) directChatMeta.textContent = "Lokaler Testchat";
      directChatHeader.innerHTML = `
        <strong>${escapeHtml(getDisplayName(demoProfile))}</strong>
        <span>Teste hier frei die Chat-Oberfläche.</span>
      `;
      directMessageInput.disabled = false;
      directMessageSend.disabled = false;
      directMessageInput.placeholder = "Demo-Nachricht schreiben...";
      directMessageList.innerHTML = demoMessages.map((message) => `
        <article class="mobile-direct-message ${message.sender_id === "me" ? "me" : ""}">
          <div>${escapeHtml(message.message)}</div>
          <span class="meta">${formatDate(message.created_at)}</span>
        </article>
      `).join("");
      directMessageList.scrollTop = directMessageList.scrollHeight;
      updateChatView();
      return;
    }

    if (!currentSession?.user) {
      if (directChatTitle) directChatTitle.textContent = "Kontakt wählen";
      if (directChatMeta) directChatMeta.textContent = "Melde dich an, um Nachrichten zu sehen.";
      directChatHeader.innerHTML = "<strong>Kontakt wählen</strong><span>Melde dich an, um Nachrichten zu sehen.</span>";
      directMessageList.innerHTML = requireLoginMessage("Noch keine Nachrichten.");
      directMessageInput.disabled = true;
      directMessageSend.disabled = true;
      updateChatView();
      return;
    }

    const activeProfile = profileMap.get(activeContactId);
    if (directChatTitle) directChatTitle.textContent = getDisplayName(activeProfile);
    if (directChatMeta) directChatMeta.textContent = getProfileMeta(activeProfile);
    directChatHeader.innerHTML = `
      <strong>${escapeHtml(getDisplayName(activeProfile))}</strong>
      <span>${escapeHtml(getProfileMeta(activeProfile))}</span>
    `;

    directMessageInput.disabled = false;
    directMessageSend.disabled = false;

    const userId = currentSession.user.id;
    const { data, error } = await client
      .from("direct_messages")
      .select("id,sender_id,recipient_id,message,created_at,read_at")
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${activeContactId}),and(sender_id.eq.${activeContactId},recipient_id.eq.${userId})`)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      directMessageList.innerHTML = requireLoginMessage("Direktnachrichten konnten noch nicht geladen werden. Führe zuerst die neue SQL-Datei in Supabase aus.");
      updateChatView();
      return;
    }

    if (!data?.length) {
      directMessageList.innerHTML = '<div class="mobile-empty-state">Noch keine Nachrichten in diesem Chat.</div>';
      updateChatView();
      return;
    }

    directMessageList.innerHTML = data.map((message) => `
      <article class="mobile-direct-message ${message.sender_id === currentSession.user.id ? "me" : ""}">
        <div>${escapeHtml(message.message)}</div>
        <span class="meta">${formatDate(message.created_at)}</span>
      </article>
    `).join("");

    directMessageList.scrollTop = directMessageList.scrollHeight;
    const unreadIds = (data || [])
      .filter((message) => message.sender_id === activeContactId && !message.read_at)
      .map((message) => message.id);
    if (unreadIds.length) {
      await client
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds);
      await loadChatPreviews();
      renderChatContacts();
    }
    updateChatView();
  }

  async function sendDirectMessage(event) {
    event.preventDefault();

    if (!activeContactId) return;
    const text = directMessageInput?.value?.trim();
    if (!text) return;

    if (activeContactId === DEMO_CONTACT_ID) {
      demoMessages.push({
        id: `demo-${Date.now()}`,
        sender_id: "me",
        recipient_id: DEMO_CONTACT_ID,
        message: text,
        created_at: new Date().toISOString()
      });
      directMessageInput.value = "";
      renderChatContacts();
      await loadDirectMessages();
      return;
    }

    if (!currentSession?.user) return;

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
    await loadChatPreviews();
    renderChatContacts();
    await loadDirectMessages();
  }

  async function handleRealtimeMessageChange() {
    await loadChatPreviews();
    renderChatContacts();
    if (activeContactId) {
      await loadDirectMessages();
    }
  }

  function setupRealtimeSubscriptions() {
    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    if (!currentSession?.user) return;

    const userId = currentSession.user.id;
    realtimeChannel = client
      .channel(`mobile-hub-${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "direct_messages",
        filter: `sender_id=eq.${userId}`
      }, () => {
        void handleRealtimeMessageChange();
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "direct_messages",
        filter: `recipient_id=eq.${userId}`
      }, () => {
        void handleRealtimeMessageChange();
      })
      .subscribe();
  }

  function attachOwnStatusCardBehavior(isLoggedIn) {
    const statusComposerToggle = document.getElementById("statusComposerToggle");
    const statusMediaInput = getStatusMediaInput();

    if (!statusComposerToggle) return;

    statusComposerToggle.addEventListener("pointerdown", () => {
      pressStatusAddCard();
    });

    if (!isLoggedIn) {
      statusComposerToggle.addEventListener("click", (event) => {
        event.preventDefault();
        statusList.innerHTML = requireLoginMessage("Melde dich an, um einen Status hochzuladen.");
      });
      return;
    }

    statusMediaInput?.addEventListener("change", () => {
      const file = statusMediaInput.files?.[0] || null;
      if (!file) return;
      openStatusEditorForFile(file);
    });
  }

  function renderStatusRail() {
    if (!statusRail) return;

    const ownCard = `
      <label id="statusComposerToggle" class="mobile-status-card mobile-status-card-own">
        <span class="mobile-status-thumb">+</span>
        <span class="mobile-status-name">Status hinzufügen</span>
        <input id="statusMediaFileInline" class="mobile-status-file-overlay" type="file" accept="image/*,video/*">
      </label>
    `;

    if (!currentSession?.user) {
      statusRail.innerHTML = ownCard;
      attachOwnStatusCardBehavior(false);
      return;
    }

    const seenUsers = new Set();
    const items = statusItems.filter((item) => {
      if (seenUsers.has(item.user_id)) return false;
      seenUsers.add(item.user_id);
      return true;
    });

    const cards = items.map((item) => {
      const owner = profileMap.get(item.user_id);
      const thumb = item.media_url
        ? `style="background-image:url('${escapeHtml(item.media_url)}')"`
        : "";
      return `
        <button class="mobile-status-card" type="button" data-status-id="${item.id}">
          <span class="mobile-status-thumb ${item.media_url ? "has-media" : ""}" ${thumb}>${item.media_url ? "" : escapeHtml(getInitials(owner))}</span>
          <span class="mobile-status-name">${escapeHtml(getDisplayName(owner))}</span>
        </button>
      `;
    }).join("");

    statusRail.innerHTML = ownCard + cards;
    attachOwnStatusCardBehavior(true);
    statusRail.querySelectorAll("[data-status-id]").forEach((button) => {
      button.addEventListener("click", () => openStatusViewer(button.dataset.statusId));
    });
  }

  function renderStatusFeed() {
    if (!statusList) return;

    if (!currentSession?.user) {
      statusList.innerHTML = requireLoginMessage("Melde dich an, um Statusmeldungen zu sehen.");
      return;
    }

    if (!statusItems.length) {
      statusList.innerHTML = '<div class="mobile-empty-state">Noch keine Statusmeldungen.</div>';
      return;
    }

    statusList.innerHTML = statusItems.map((item) => {
      const owner = profileMap.get(item.user_id);
      return `
        <button class="mobile-status-feed-item" type="button" data-status-id="${item.id}">
          <span class="mobile-status-feed-avatar">${escapeHtml(getInitials(owner))}</span>
          <span class="mobile-status-feed-copy">
            <span class="mobile-status-feed-top">
              <strong>${escapeHtml(getDisplayName(owner))}</strong>
              <time>${escapeHtml(formatStatusAge(item.created_at))}</time>
            </span>
            <span class="mobile-status-feed-bottom">${escapeHtml(item.text_content || (item.media_type === "video" ? "Video" : "Foto"))}</span>
          </span>
        </button>
      `;
    }).join("");

    statusList.querySelectorAll("[data-status-id]").forEach((button) => {
      button.addEventListener("click", () => openStatusViewer(button.dataset.statusId));
    });
  }

  async function loadStatuses() {
    if (!statusList || !statusRail) return;

    if (!currentSession?.user) {
      statusItems = [];
      renderStatusRail();
      renderStatusFeed();
      return;
    }

    const { data, error } = await client
      .from("status_posts")
      .select("id,user_id,text_content,media_url,media_type,created_at,expires_at")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      statusItems = [];
      renderStatusRail();
      statusList.innerHTML = requireLoginMessage("Status konnte noch nicht geladen werden. Führe zuerst die neue SQL-Datei in Supabase aus.");
      return;
    }

    statusItems = data || [];
    renderStatusRail();
    renderStatusFeed();
  }

  async function publishStatus() {
    if (!currentSession?.user || !selectedStatusFile) return;

    const text = statusEditorCaption?.value?.trim() || null;
    let mediaUrl = null;
    let mediaType = null;
    let fileToUpload = selectedStatusFile;

    statusPublishBtn.disabled = true;
    try {
      fileToUpload = await buildEditedStatusFile();
      const upload = await uploadStatusMedia(fileToUpload);
      mediaUrl = upload.url;
      mediaType = upload.type;
    } catch (_) {
      statusList.innerHTML = requireLoginMessage("Medien konnten nicht hochgeladen werden. Prüfe den Bucket 'status-media' in Supabase.");
      statusPublishBtn.disabled = false;
      return;
    }

    const { error } = await client.from("status_posts").insert({
      user_id: currentSession.user.id,
      text_content: text,
      media_url: mediaUrl,
      media_type: mediaType
    });

    statusPublishBtn.disabled = false;

    if (error) {
      statusList.innerHTML = requireLoginMessage("Status konnte nicht gepostet werden. Bitte prüfe die neue SQL-Datei in Supabase.");
      return;
    }

    resetStatusSelection();
    await loadStatuses();
  }

  async function deleteActiveStatus() {
    if (!currentSession?.user || !activeStatusId) return;
    const item = statusItems.find((entry) => entry.id === activeStatusId);
    if (!item || item.user_id !== currentSession.user.id) return;

    const { error } = await client
      .from("status_posts")
      .delete()
      .eq("id", activeStatusId)
      .eq("user_id", currentSession.user.id);

    if (error) {
      statusList.innerHTML = requireLoginMessage("Status konnte nicht gelöscht werden.");
      return;
    }

    const storagePath = getStoragePathFromUrl(item.media_url);
    if (storagePath) {
      await client.storage.from(STATUS_MEDIA_BUCKET).remove([storagePath]);
    }

    closeStatusViewer();
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

  let hubRefreshInFlight = false;

  async function refreshAll() {
    if (hubRefreshInFlight) return;
    hubRefreshInFlight = true;
    try {
      await loadProfiles();
      await loadChatPreviews();
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
    } finally {
      hubRefreshInFlight = false;
    }
  }

  window.addEventListener("mini-chatroulette:mobile-tab", (event) => {
    const tab = event.detail?.tab || "chats";
    setActivePane(tab);
    if (tab !== "chat") {
      activeContactId = null;
      updateChatView();
    }
    closeStatusViewer();
    closeStatusEditor();
    if (tab === "status" || tab === "calls" || tab === "chat") {
      void refreshAll();
    }
  });

  directChatSearch?.addEventListener("input", renderChatContacts);
  directMessageForm?.addEventListener("submit", sendDirectMessage);
  directChatFab?.addEventListener("click", () => {
    directChatSearch?.focus();
  });
  statusEditorClose?.addEventListener("click", resetStatusSelection);
  statusPublishBtn?.addEventListener("click", publishStatus);
  statusEditorTools.forEach((button) => {
    button.addEventListener("click", () => {
      const label = button.dataset.statusTool;
      hideEditorTools();

      if (label === "text") {
        if (statusEditorToolPanel) statusEditorToolPanel.hidden = false;
        if (statusTextTool) statusTextTool.hidden = false;
        if (statusTextToolInput) {
          statusTextToolInput.value = textOverlayState.text;
          statusTextToolInput.focus();
        }
        return;
      }

      if (label === "draw" && !statusEditorVideo?.hidden) {
        if (statusEditorCaption) statusEditorCaption.value = "Zeichnen funktioniert zuerst für Bilder.";
        return;
      }

      if (label === "draw") {
        if (statusEditorToolPanel) statusEditorToolPanel.hidden = false;
        if (statusDrawTool) statusDrawTool.hidden = false;
        drawEnabled = true;
        if (statusDrawCanvas) {
          statusDrawCanvas.hidden = false;
          statusDrawCanvas.style.pointerEvents = "auto";
        }
        return;
      }

      const messages = {
        music: "Musik kommt als nächster Schritt.",
        crop: "Zuschneiden und Drehen kommt als nächster Schritt.",
        stickers: "Sticker, Standort und Uhrzeit kommen als nächster Schritt."
      };
      if (statusEditorCaption) {
        statusEditorCaption.value = messages[label] || "";
      }
    });
  });
  statusTextToolApply?.addEventListener("click", () => {
    textOverlayState.text = statusTextToolInput?.value?.trim() || "";
    syncTextOverlay();
    hideEditorTools();
  });
  statusDrawClear?.addEventListener("click", clearDrawCanvas);
  statusDrawDone?.addEventListener("click", hideEditorTools);
  statusDrawColors.forEach((button) => {
    button.addEventListener("click", () => {
      drawColor = button.dataset.drawColor || "#ffffff";
      statusDrawColors.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });
  statusDrawCanvas?.addEventListener("pointerdown", startDraw);
  statusDrawCanvas?.addEventListener("pointermove", moveDraw);
  statusDrawCanvas?.addEventListener("pointerup", stopDraw);
  statusDrawCanvas?.addEventListener("pointerleave", stopDraw);
  statusTextOverlay?.addEventListener("pointerdown", startTextDrag);
  window.addEventListener("pointermove", moveTextDrag);
  window.addEventListener("pointerup", stopTextDrag);
  window.addEventListener("resize", resizeDrawCanvas);
  statusViewerClose?.addEventListener("click", closeStatusViewer);
  statusViewerDelete?.addEventListener("click", deleteActiveStatus);
  directChatBack?.addEventListener("click", async () => {
    activeContactId = null;
    updateChatView();
    renderChatContacts();
    await loadDirectMessages();
  });
  client.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    setupRealtimeSubscriptions();
    activeContactId = null;
    updateChatView();
    closeStatusViewer();
    resetStatusSelection();
    window.setTimeout(() => {
      void refreshAll();
    }, 0);
  });

  client.auth.getSession().then(({ data }) => {
    currentSession = data.session;
    setupRealtimeSubscriptions();
    updateChatView();
    window.setTimeout(() => {
      void refreshAll();
    }, 0);
  });
})();
