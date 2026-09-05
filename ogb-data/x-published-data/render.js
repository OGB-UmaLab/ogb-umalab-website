(function () {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "styles.css?v=20260905";
  document.head.appendChild(stylesheet);
  const list = document.getElementById("x-published-data-list");
  const entries = Array.isArray(window.ogbXPublishedData) ? window.ogbXPublishedData.slice() : [];
  entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  entries.forEach((entry) => {
    const row = entry.url ? document.createElement("a") : document.createElement("div");
    row.className = "x-published-data-row";
    if (entry.url) {
      row.href = entry.url;
      row.target = "_blank";
      row.rel = "noopener noreferrer";
    }
    const date = document.createElement("time");
    date.dateTime = entry.date;
    date.textContent = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric" }).format(new Date(`${entry.date}T00:00:00`));
    const races = document.createElement("span");
    races.textContent = entry.races;
    row.append(date, races);
    list.appendChild(row);
  });
})();
