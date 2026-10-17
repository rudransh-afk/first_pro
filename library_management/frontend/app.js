const API_BASE = "https://greenwitchlibrary.onrender.com";
let editingBookId = null;
let editingMemberId = null;
let confirmResolver = null;

const $ = (id) => document.getElementById(id);

function showToast(message, isError = false) {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = `toast${isError ? " error" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

async function apiRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  if (!res.ok) {
    let detail = "Something went wrong";
    try { const body = await res.json(); detail = body.detail || detail; } catch (_) {}
    throw new Error(detail);
  }
  return res.status === 204 ? null : res.json();
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function openModal(id) { $(id).classList.remove("hidden"); document.body.style.overflow = "hidden"; }
function closeModal(id) { $(id).classList.add("hidden"); if (["bookModal","memberModal","confirmModal"].every(x => $(x).classList.contains("hidden"))) document.body.style.overflow = ""; }
function emptyRow(message, colspan) { return `<tr><td colspan="${colspan}"><div class="empty-state"><strong>${escapeHtml(message)}</strong><span>Try adding something or changing your search.</span></div></td></tr>`; }

function activateTab(tab) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === tab));
  if (tab === "dashboard") loadDashboard();
  if (tab === "books") loadBooks($("bookSearch").value);
  if (tab === "members") loadMembers($("memberSearch").value);
  if (tab === "loans") { refreshCheckoutSelectors(); loadLoans(); }
}

document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));
document.querySelectorAll("[data-tab-link]").forEach(btn => btn.addEventListener("click", () => activateTab(btn.dataset.tabLink)));
$("mobileMenuBtn").addEventListener("click", () => $("mobileMenuBtn").closest(".mobile-header").previousElementSibling.classList.toggle("open"));
document.querySelectorAll(".sidebar .nav-btn").forEach(btn => btn.addEventListener("click", () => document.querySelector(".sidebar").classList.remove("open")));

async function loadDashboard() {
  try {
    const [books, members, loans] = await Promise.all([apiRequest("/books"), apiRequest("/members"), apiRequest("/loans")]);
    const totalCopies = books.reduce((sum, b) => sum + b.quantity, 0);
    const available = books.reduce((sum, b) => sum + b.available_quantity, 0);
    const active = loans.filter(l => !l.returned);
    const overdue = active.filter(l => l.due_date && new Date(l.due_date) < new Date());
    $("statBooks").textContent = totalCopies;
    $("statBooksMeta").textContent = `${books.length} unique title${books.length === 1 ? "" : "s"}`;
    $("statMembers").textContent = members.length;
    $("statLoans").textContent = active.length;
    $("statLoansMeta").textContent = `${totalCopies - available} copies currently out`;
    $("statOverdue").textContent = overdue.length;
    const pct = totalCopies ? Math.round((available / totalCopies) * 100) : 0;
    $("availablePercent").textContent = `${pct}%`;
    $("availableMeter").style.width = `${pct}%`;
    $("availabilityText").textContent = `${available} of ${totalCopies} copies are currently available.`;
    $("latestBook").textContent = books[0]?.title || "No books yet";
    renderActivity(loans.slice(0, 6));
  } catch (err) { showToast(err.message, true); }
}
function renderActivity(loans) {
  const el = $("recentActivity");
  if (!loans.length) { el.innerHTML = `<div class="empty-state"><strong>No activity yet</strong><span>Checkouts and returns will appear here.</span></div>`; return; }
  el.innerHTML = loans.map(l => `<div class="activity-item"><div class="activity-icon">${l.returned ? "↩" : "↗"}</div><div><b>${escapeHtml(l.book_title || "Unknown book")}</b><small>${l.returned ? `Returned by ${escapeHtml(l.member_name || "member")}` : `Checked out by ${escapeHtml(l.member_name || "member")}`}</small></div><span class="activity-date">${formatDate(l.return_date || l.checkout_date)}</span></div>`).join("");
}

async function loadBooks(search = "") {
  try {
    const books = await apiRequest(`/books${search ? `?search=${encodeURIComponent(search)}` : ""}`);
    $("bookCount").textContent = `${books.length} result${books.length === 1 ? "" : "s"}`;
    $("booksTableBody").innerHTML = books.length ? books.map(book => `<tr><td><div class="book-name">${escapeHtml(book.title)}</div><div class="book-author">${escapeHtml(book.author)}</div></td><td><span class="isbn">${escapeHtml(book.isbn)}</span></td><td><div class="availability"><span class="badge ${book.available_quantity ? "ok" : "warn"}">${book.available_quantity ? `${book.available_quantity} available` : "All checked out"}</span><span class="result-count">of ${book.quantity}</span></div></td><td><div class="actions"><button class="table-action" onclick="editBook(${book.id})">Edit</button><button class="table-action danger" onclick="deleteBook(${book.id})">Delete</button></div></td></tr>`).join("") : emptyRow("No books found", 4);
  } catch (err) { showToast(err.message, true); }
}
window.editBook = async id => { try { const b = await apiRequest(`/books/${id}`); editingBookId = id; $("bookId").value=id; $("bookTitle").value=b.title; $("bookAuthor").value=b.author; $("bookIsbn").value=b.isbn; $("bookQuantity").value=b.quantity; $("bookModalTitle").textContent="Edit book"; $("bookSubmitBtn").textContent="Save changes"; openModal("bookModal"); } catch(e){showToast(e.message,true)} };
window.deleteBook = async id => { if (!await askConfirm("Delete this book?", "This removes the title from your collection. Books with active loans cannot be deleted.")) return; try { await apiRequest(`/books/${id}`, {method:"DELETE"}); showToast("Book deleted"); loadBooks($("bookSearch").value); loadDashboard(); refreshCheckoutSelectors(); } catch(e){showToast(e.message,true)} };
function resetBookForm(){ editingBookId=null; $("bookForm").reset(); $("bookQuantity").value=1; $("bookModalTitle").textContent="Add a book"; $("bookSubmitBtn").textContent="Add book"; }
$("addBookBtn").addEventListener("click",()=>{resetBookForm();openModal("bookModal")});
$("bookForm").addEventListener("submit",async e=>{e.preventDefault();const payload={title:$("bookTitle").value.trim(),author:$("bookAuthor").value.trim(),isbn:$("bookIsbn").value.trim(),quantity:parseInt($("bookQuantity").value,10)};try{if(editingBookId) await apiRequest(`/books/${editingBookId}`,{method:"PUT",body:JSON.stringify(payload)});else await apiRequest("/books",{method:"POST",body:JSON.stringify(payload)});closeModal("bookModal");showToast(editingBookId?"Book updated":"Book added");resetBookForm();loadBooks($("bookSearch").value);loadDashboard();refreshCheckoutSelectors()}catch(e){showToast(e.message,true)}});

async function loadMembers(search = "") { try { const members=await apiRequest(`/members${search?`?search=${encodeURIComponent(search)}`:""}`); $("memberCount").textContent=`${members.length} member${members.length===1?"":"s"}`; $("membersTableBody").innerHTML=members.length?members.map(m=>`<tr><td><div class="book-name">${escapeHtml(m.name)}</div></td><td>${escapeHtml(m.email)}</td><td>${escapeHtml(m.phone||"—")}</td><td><div class="actions"><button class="table-action" onclick="editMember(${m.id})">Edit</button><button class="table-action danger" onclick="deleteMember(${m.id})">Delete</button></div></td></tr>`).join(""):emptyRow("No members found",4)}catch(e){showToast(e.message,true)} }
window.editMember=async id=>{try{const m=await apiRequest(`/members/${id}`);editingMemberId=id;$("memberId").value=id;$("memberName").value=m.name;$("memberEmail").value=m.email;$("memberPhone").value=m.phone||"";$("memberModalTitle").textContent="Edit member";$("memberSubmitBtn").textContent="Save changes";openModal("memberModal")}catch(e){showToast(e.message,true)}};
window.deleteMember=async id=>{if(!await askConfirm("Delete this member?","This removes the reader record. Members with active loans cannot be deleted."))return;try{await apiRequest(`/members/${id}`,{method:"DELETE"});showToast("Member deleted");loadMembers($("memberSearch").value);loadDashboard();refreshCheckoutSelectors()}catch(e){showToast(e.message,true)}};
function resetMemberForm(){editingMemberId=null;$("memberForm").reset();$("memberModalTitle").textContent="Add a member";$("memberSubmitBtn").textContent="Add member"}
$("addMemberBtn").addEventListener("click",()=>{resetMemberForm();openModal("memberModal")});
$("memberForm").addEventListener("submit",async e=>{e.preventDefault();const payload={name:$("memberName").value.trim(),email:$("memberEmail").value.trim(),phone:$("memberPhone").value.trim()||null};try{if(editingMemberId)await apiRequest(`/members/${editingMemberId}`,{method:"PUT",body:JSON.stringify(payload)});else await apiRequest("/members",{method:"POST",body:JSON.stringify(payload)});closeModal("memberModal");showToast(editingMemberId?"Member updated":"Member added");resetMemberForm();loadMembers($("memberSearch").value);loadDashboard();refreshCheckoutSelectors()}catch(e){showToast(e.message,true)}});

async function refreshCheckoutSelectors(){try{const [books,members]=await Promise.all([apiRequest("/books"),apiRequest("/members")]);const available=books.filter(b=>b.available_quantity>0);$("checkoutBook").innerHTML=available.length?available.map(b=>`<option value="${b.id}">${escapeHtml(b.title)} · ${b.available_quantity} available</option>`).join(""):`<option value="" disabled selected>No books available</option>`;$("checkoutMember").innerHTML=members.length?members.map(m=>`<option value="${m.id}">${escapeHtml(m.name)}</option>`).join(""):`<option value="" disabled selected>No members yet</option>`;$("checkoutForm").querySelector("button").disabled=!available.length||!members.length}catch(e){showToast(e.message,true)}}
async function loadLoans(){try{const activeOnly=$("activeOnlyToggle").checked;const loans=await apiRequest(`/loans?active_only=${activeOnly}`);$("loansTableBody").innerHTML=loans.length?loans.map(l=>{const overdue=!l.returned&&l.due_date&&new Date(l.due_date)<new Date();return `<tr><td><div class="book-name">${escapeHtml(l.book_title||"—")}</div></td><td>${escapeHtml(l.member_name||"—")}</td><td>${formatDate(l.checkout_date)}</td><td>${formatDate(l.due_date)}</td><td><span class="badge ${overdue?"warn":l.returned?"neutral":"ok"}">${overdue?"Overdue":l.returned?`Returned ${formatDate(l.return_date)}`:"Active"}</span></td><td>${l.returned?"—":`<button class="table-action" onclick="returnLoan(${l.id})">Return</button>`}</td></tr>`}).join(""):emptyRow(activeOnly?"No active loans":"No loan history",6)}catch(e){showToast(e.message,true)}}
window.returnLoan=async id=>{try{await apiRequest(`/loans/${id}/return`,{method:"POST"});showToast("Book returned");loadLoans();refreshCheckoutSelectors();loadBooks($("bookSearch").value);loadDashboard()}catch(e){showToast(e.message,true)}};
$("checkoutForm").addEventListener("submit",async e=>{e.preventDefault();const payload={book_id:parseInt($("checkoutBook").value,10),member_id:parseInt($("checkoutMember").value,10),days:parseInt($("checkoutDays").value,10)||14};try{await apiRequest("/loans/checkout",{method:"POST",body:JSON.stringify(payload)});showToast("Book checked out");loadLoans();refreshCheckoutSelectors();loadBooks($("bookSearch").value);loadDashboard()}catch(e){showToast(e.message,true)}});

function askConfirm(title,text){return new Promise(resolve=>{confirmResolver=resolve;$("confirmTitle").textContent=title;$("confirmText").textContent=text;openModal("confirmModal")})}
$("confirmCancel").addEventListener("click",()=>{closeModal("confirmModal");confirmResolver?.(false);confirmResolver=null});$("confirmAction").addEventListener("click",()=>{closeModal("confirmModal");confirmResolver?.(true);confirmResolver=null});
document.querySelectorAll("[data-close]").forEach(el=>el.addEventListener("click",()=>closeModal(el.dataset.close)));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){["bookModal","memberModal","confirmModal"].forEach(id=>$(id).classList.contains("hidden")||closeModal(id));}});

let timer;$("bookSearch").addEventListener("input",e=>{clearTimeout(timer);timer=setTimeout(()=>loadBooks(e.target.value),220)});let mtimer;$("memberSearch").addEventListener("input",e=>{clearTimeout(mtimer);mtimer=setTimeout(()=>loadMembers(e.target.value),220)});$("activeOnlyToggle").addEventListener("change",loadLoans);$("quickCheckoutBtn").addEventListener("click",()=>{activateTab("loans");setTimeout(()=>$("checkoutBook").focus(),50)});

loadDashboard();
