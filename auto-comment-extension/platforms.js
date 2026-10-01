/* Konfigurasi per platform. Semua CSS selector di sini BELUM diverifikasi terhadap
   situs live dan bisa berubah kapan saja. Jika nama penulis / tombol kirim tidak
   terdeteksi, buka DevTools di situs tsb dan perbarui selector di file ini.
   Selalu ada fallback generik, jadi selector yang salah tidak membuat ekstensi rusak:
   - editor  : textarea / contenteditable apa pun yang sedang fokus
   - konteks : <article> terdekat, lalu meta og:title / og:description / og:image
   - kirim   : tombol terdekat berlabel Post/Reply/Kirim/Balas/... */
(function (root) {
  const AC = (root.AC = root.AC || {});

  AC.PLATFORMS = {
    dribbble: {
      name: "Dribbble",
      hosts: ["dribbble.com"],
      group: "dribbble",
      container: null, // halaman shot = satu postingan
      author: ".shot-header .user-information a, .shot-user-details a, a.hoverable-user-name",
      authorFromTitle: /\bby (.+?) on Dribbble/i,
      text: ".shot-description, .shot-content-container p",
      submit: "form button[type=submit], button.btn2--primary",
    },
    behance: {
      name: "Behance",
      hosts: ["behance.net"],
      group: "dribbble",
      container: null,
      author: "[class*='Owner'] a, [class*='owner'] a",
      text: "[class*='ProjectInfo'], [class*='description']",
      submit: "form button[type=submit]",
    },
    linkedin: {
      name: "LinkedIn",
      hosts: ["linkedin.com"],
      group: "linkedin",
      container: ".feed-shared-update-v2, [data-urn^='urn:li:activity'], article",
      author: ".update-components-actor__title span[aria-hidden=true], .update-components-actor__name span[aria-hidden=true]",
      text: ".update-components-text, .feed-shared-inline-show-more-text",
      submit: "button.comments-comment-box__submit-button, button.comments-comment-box__submit-button--cr",
    },
    twitter: {
      name: "X / Twitter",
      hosts: ["x.com", "twitter.com"],
      group: "twitter",
      container: "article[data-testid='tweet']",
      firstContainerIfOutside: true, // composer balasan di halaman status ada di luar <article>
      author: "[data-testid='User-Name'] span",
      text: "[data-testid='tweetText']",
      submit: "[data-testid='tweetButtonInline'], [data-testid='tweetButton']",
    },
    threads: {
      name: "Threads",
      hosts: ["threads.net", "threads.com"],
      group: "twitter",
      container: "[data-pressable-container]",
      author: "a[href^='/@'] span",
      text: "[data-pressable-container] span[dir=auto]",
      submit: "div[role=button]:has(> div > svg[aria-label='Post']), div[role=button]:has(svg[aria-label='Reply'])",
    },
    instagram: {
      name: "Instagram",
      hosts: ["instagram.com"],
      group: "instagram",
      container: "article",
      firstContainerIfOutside: true,
      author: "header a[role=link] span, header a span",
      authorFromTitle: /^(.+?) on Instagram/i,
      text: "h1, ul li span[dir=auto]",
      submit: "form div[role=button], form button[type=submit]",
    },
    tiktok: {
      name: "TikTok",
      hosts: ["tiktok.com"],
      group: "instagram",
      container: null,
      author: "[data-e2e='browse-username'], [data-e2e='video-author-uniqueid']",
      text: "[data-e2e='browse-video-desc'], [data-e2e='video-desc']",
      submit: "[data-e2e='comment-post']",
    },
    facebook: {
      name: "Facebook",
      hosts: ["facebook.com"],
      group: "general",
      container: "[role=article]",
      author: "h2 a, h3 a, strong a",
      text: "[data-ad-preview='message'], [data-ad-comet-preview='message']",
      submit: "[aria-label='Comment'][role=button], [aria-label='Komentari'][role=button], [aria-label='Post comment']",
    },
    youtube: {
      name: "YouTube",
      hosts: ["youtube.com"],
      group: "general",
      container: null,
      author: "ytd-video-owner-renderer #channel-name a, #owner #channel-name a",
      text: "h1.ytd-watch-metadata, #description-inline-expander",
      submit: "#submit-button button, ytd-button-renderer#submit-button",
    },
    reddit: {
      name: "Reddit",
      hosts: ["reddit.com"],
      group: "general",
      container: "shreddit-post",
      firstContainerIfOutside: true,
      author: "[slot='authorName'] a, a[href^='/user/']",
      text: "[slot='title'], [slot='text-body']",
      submit: "button[slot='submit-button'], button[type=submit]",
    },
  };

  AC.GENERIC_PLATFORM = { key: "general", name: "Situs ini", group: "general", container: null };

  AC.detectPlatform = function (hostname) {
    const h = (hostname || "").toLowerCase().replace(/^www\./, "");
    for (const [key, p] of Object.entries(AC.PLATFORMS)) {
      if (p.hosts.some((d) => h === d || h.endsWith("." + d))) return { key, ...p };
    }
    return AC.GENERIC_PLATFORM;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = AC;
})(typeof globalThis !== "undefined" ? globalThis : self);
