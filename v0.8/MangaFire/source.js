"use strict";
var _Sources = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = Object.getOwnPropertyDescriptor(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/MangaFire/MangaFire.js
  var MangaFire_exports = {};
  __export(MangaFire_exports, {
    MangaFire: () => MangaFire,
    MangaFireInfo: () => MangaFireInfo
  });

  var PBContentRating = globalThis.ContentRating ?? { EVERYONE: "EVERYONE", MATURE: "MATURE" };
  var PBHomeSectionType = globalThis.HomeSectionType ?? {
    singleRowLarge: "singleRowLarge",
    singleRowNormal: "singleRowNormal"
  };
  var PBSourceIntents = globalThis.SourceIntents ?? {
    MANGA_CHAPTERS: 1 << 0,
    HOMEPAGE_SECTIONS: 1 << 1,
    CLOUDFLARE_BYPASS_REQUIRED: 1 << 2,
    SETTINGS_UI: 1 << 3
  };

  var MF_DOMAIN = "https://mangafire.to";

  var SUPPORTED_LANGUAGES = [
    { code: "en", label: "English", flag: "\u{1F1EC}\u{1F1E7}", short: "EN" },
    { code: "fr", label: "French", flag: "\u{1F1EB}\u{1F1F7}", short: "FR" },
    { code: "es", label: "Spanish", flag: "\u{1F1EA}\u{1F1F8}", short: "ES" },
    { code: "es-la", label: "Spanish (LATAM)", flag: "\u{1F1F2}\u{1F1FD}", short: "ESLA" },
    { code: "pt", label: "Portuguese", flag: "\u{1F1F5}\u{1F1F9}", short: "PT" },
    { code: "pt-br", label: "Portuguese (Br)", flag: "\u{1F1E7}\u{1F1F7}", short: "PTBR" },
    { code: "ja", label: "Japanese", flag: "\u{1F1EF}\u{1F1F5}", short: "JP" }
  ];

  var MangaFireInfo = {
    version: "1.0.0",
    name: "MangaFire",
    description: "Extension that pulls manga from MangaFire",
    author: "Codex",
    authorWebsite: "https://github.com/openai",
    icon: "icon.png",
    contentRating: PBContentRating.EVERYONE,
    websiteBaseURL: MF_DOMAIN,
    intents: PBSourceIntents.MANGA_CHAPTERS | PBSourceIntents.HOMEPAGE_SECTIONS | PBSourceIntents.CLOUDFLARE_BYPASS_REQUIRED | PBSourceIntents.SETTINGS_UI,
    sourceTags: []
  };

  var URLBuilder = class {
    constructor(baseUrl) {
      this.baseUrl = baseUrl.replace(/\/+$/g, "");
      this.pathParts = [];
      this.queryPairs = [];
    }
    addPathComponent(part) {
      this.pathParts.push(String(part).replace(/^\/+|\/+$/g, ""));
      return this;
    }
    addQueryParameter(key, value) {
      if (value === void 0 || value === null || value === "") {
        return this;
      }
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry !== void 0 && entry !== null && entry !== "") {
            this.queryPairs.push([key, String(entry)]);
          }
        });
        return this;
      }
      this.queryPairs.push([key, String(value)]);
      return this;
    }
    buildUrl() {
      var path = this.pathParts.length > 0 ? `/${this.pathParts.join("/")}` : "";
      if (this.queryPairs.length === 0) {
        return `${this.baseUrl}${path}`;
      }
      var query = this.queryPairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
      return `${this.baseUrl}${path}?${query}`;
    }
  };

  function parseDateString(raw) {
    var now = new Date();
    var value = (raw ?? "").trim();
    if (!value) return now;
    if (/^yesterday$/i.test(value)) {
      now.setDate(now.getDate() - 1);
      return now;
    }
    var relative = value.match(/(\d+)\s+(second|minute|hour|day)s?\s+ago/i);
    if (relative) {
      var amount = Number(relative[1]);
      var unit = relative[2].toLowerCase();
      if (unit === "second") now.setSeconds(now.getSeconds() - amount);
      if (unit === "minute") now.setMinutes(now.getMinutes() - amount);
      if (unit === "hour") now.setHours(now.getHours() - amount);
      if (unit === "day") now.setDate(now.getDate() - amount);
      return now;
    }
    var parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return now;
    return parsed;
  }

  function parseStatus(rawStatus) {
    var value = (rawStatus ?? "").toLowerCase();
    if (value.includes("releasing")) return "ONGOING";
    if (value.includes("completed")) return "COMPLETED";
    if (value.includes("hiatus")) return "HIATUS";
    if (value.includes("discontinued")) return "UNKNOWN";
    if (value.includes("not yet published")) return "UNKNOWN";
    return "UNKNOWN";
  }

  function tagId(section, value) {
    return `${section}:${value}`;
  }

  function parseTagValue(tag, section) {
    if (!tag?.id?.startsWith(`${section}:`)) return "";
    return tag.id.slice(section.length + 1);
  }

  function getIncludedTagValues(tags, section) {
    return (tags ?? []).map((tag) => parseTagValue(tag, section)).filter(Boolean);
  }

  function getExcludedTagValues(tags, section) {
    return (tags ?? []).map((tag) => parseTagValue(tag, section)).filter(Boolean);
  }

  function parseMangaIdFromUrl(url) {
    var path = (url ?? "").replace(/\/$/, "").split("/").pop() ?? "";
    return path;
  }

  function parseChapterNumber(raw) {
    var value = String(raw ?? "").trim();
    var asFloat = parseFloat(value);
    return Number.isNaN(asFloat) ? 0 : asFloat;
  }

  function safeAtob(str) {
    if (typeof atob === "function") return atob(str);
    if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("binary");
    throw new Error("No base64 decoder available");
  }

  function safeBtoa(str) {
    if (typeof btoa === "function") return btoa(str);
    if (typeof Buffer !== "undefined") return Buffer.from(str, "binary").toString("base64");
    throw new Error("No base64 encoder available");
  }

  function toBytes(str) {
    return Array.from(str, (char) => char.charCodeAt(0) & 255);
  }

  function fromBytes(bytes) {
    return bytes.map((byte) => String.fromCharCode(byte & 255)).join("");
  }

  function rc4Bytes(key, input) {
    var state = Array.from({ length: 256 }, (_, i) => i);
    var j = 0;
    for (var i = 0; i < 256; i++) {
      j = (j + state[i] + key.charCodeAt(i % key.length)) & 255;
      [state[i], state[j]] = [state[j], state[i]];
    }
    var output = new Array(input.length);
    var i2 = 0;
    j = 0;
    for (var y = 0; y < input.length; y++) {
      i2 = (i2 + 1) & 255;
      j = (j + state[i2]) & 255;
      [state[i2], state[j]] = [state[j], state[i2]];
      var k = state[(state[i2] + state[j]) & 255];
      output[y] = (input[y] ^ k) & 255;
    }
    return output;
  }

  function transform(input, initSeedBytes, prefixKeyString, prefixLen, schedule) {
    var output = [];
    for (var i = 0; i < input.length; i++) {
      if (i < prefixLen) {
        output.push(prefixKeyString.charCodeAt(i) & 255);
      }
      output.push(schedule[i % 10]((input[i] ^ initSeedBytes[i % 32]) & 255) & 255);
    }
    return output;
  }

  var add8 = (n) => (c) => (c + n) & 255;
  var sub8 = (n) => (c) => (c - n + 256) & 255;
  var xor8 = (n) => (c) => (c ^ n) & 255;
  var rotl8 = (n) => (c) => ((c << n) | (c >>> (8 - n))) & 255;

  var scheduleC = [sub8(48), sub8(19), xor8(241), sub8(19), add8(223), sub8(19), sub8(170), sub8(19), sub8(48), xor8(8)];
  var scheduleY = [rotl8(4), add8(223), rotl8(4), xor8(163), sub8(48), add8(82), add8(223), sub8(48), xor8(83), rotl8(4)];
  var scheduleB = [sub8(19), add8(82), sub8(48), sub8(170), rotl8(4), sub8(48), sub8(170), xor8(8), add8(82), xor8(163)];
  var scheduleJ = [add8(223), rotl8(4), add8(223), xor8(83), sub8(19), add8(223), sub8(170), add8(223), sub8(170), xor8(83)];
  var scheduleE = [add8(82), xor8(83), xor8(163), add8(82), sub8(170), xor8(8), xor8(241), add8(82), add8(176), rotl8(4)];

  var RC4_KEYS = {
    l: "u8cBwTi1CM4XE3BkwG5Ble3AxWgnhKiXD9Cr279yNW0=",
    g: "t00NOJ/Fl3wZtez1xU6/YvcWDoXzjrDHJLL2r/IWgcY=",
    B: "S7I+968ZY4Fo3sLVNH/ExCNq7gjuOHjSRgSqh6SsPJc=",
    m: "7D4Q8i8dApRj6UWxXbIBEa1UqvjI+8W0UvPH9talJK8=",
    F: "0JsmfWZA1kwZeWLk5gfV5g41lwLL72wHbam5ZPfnOVE="
  };

  var SEEDS32 = {
    A: "pGjzSCtS4izckNAOhrY5unJnO2E1VbrU+tXRYG24vTo=",
    V: "dFcKX9Qpu7mt/AD6mb1QF4w+KqHTKmdiqp7penubAKI=",
    N: "owp1QIY/kBiRWrRn9TLN2CdZsLeejzHhfJwdiQMjg3w=",
    P: "H1XbRvXOvZAhyyPaO68vgIUgdAHn68Y6mrwkpIpEue8=",
    k: "2Nmobf/mpQ7+Dxq1/olPSDj3xV8PZkPbKaucJvVckL0="
  };

  var PREFIX_KEYS = {
    O: "Rowe+rg/0g==",
    v: "8cULcnOMJVY8AA==",
    L: "n2+Og2Gth8Hh",
    p: "aRpvzH+yoA==",
    W: "ZB4oBi0="
  };

  function bytesFromBase64(base64) {
    return toBytes(safeAtob(base64));
  }

  function base64UrlEncodeBytes(bytes) {
    var std = safeBtoa(fromBytes(bytes));
    return std.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function generateVRF(input) {
    var bytes = toBytes(encodeURIComponent(input));
    bytes = rc4Bytes(safeAtob(RC4_KEYS.l), bytes);
    bytes = transform(bytes, bytesFromBase64(SEEDS32.A), safeAtob(PREFIX_KEYS.O), 7, scheduleC);
    bytes = rc4Bytes(safeAtob(RC4_KEYS.g), bytes);
    bytes = transform(bytes, bytesFromBase64(SEEDS32.V), safeAtob(PREFIX_KEYS.v), 10, scheduleY);
    bytes = rc4Bytes(safeAtob(RC4_KEYS.B), bytes);
    bytes = transform(bytes, bytesFromBase64(SEEDS32.N), safeAtob(PREFIX_KEYS.L), 9, scheduleB);
    bytes = rc4Bytes(safeAtob(RC4_KEYS.m), bytes);
    bytes = transform(bytes, bytesFromBase64(SEEDS32.P), safeAtob(PREFIX_KEYS.p), 7, scheduleJ);
    bytes = rc4Bytes(safeAtob(RC4_KEYS.F), bytes);
    bytes = transform(bytes, bytesFromBase64(SEEDS32.k), safeAtob(PREFIX_KEYS.W), 5, scheduleE);
    return base64UrlEncodeBytes(bytes);
  }

  function toArrayData(responseData) {
    if (typeof responseData === "string") return responseData;
    if (responseData?.toString) return responseData.toString();
    return String(responseData ?? "");
  }

  async function parseSearchOptions(source) {
    var request = App.createRequest({
      url: `${MF_DOMAIN}/filter`,
      method: "GET"
    });
    var response = await source.requestManager.schedule(request, 1);
    source.CloudFlareError(response.status);
    var $ = load(toArrayData(response.data));
    var parseDropdownOptions = (selector) => {
      var items = [];
      $(selector).each((_idx, node) => {
        var value = $(node).find("input").attr("value") ?? "";
        var label = $(node).find("label").text().trim();
        if (value && label) {
          items.push({ id: value, label });
        }
      });
      return items;
    };
    return {
      types: parseDropdownOptions(".dropdown:has(button .value[data-placeholder='Type']) .dropdown-menu.noclose.c1 li"),
      genres: parseDropdownOptions(".genres li"),
      statuses: parseDropdownOptions(".dropdown:has(button .value[data-placeholder='Status']) .dropdown-menu.noclose.c1 li"),
      languages: parseDropdownOptions(".dropdown:has(button .value[data-placeholder='Language']) .dropdown-menu.noclose.c1 li"),
      years: parseDropdownOptions(".dropdown:has(button .value[data-placeholder='Year']) .dropdown-menu li"),
      lengths: parseDropdownOptions(".dropdown:has(button .value[data-placeholder='Length']) .dropdown-menu.noclose.c1 li"),
      sorts: parseDropdownOptions(".dropdown:has(button .value[data-placeholder='Sort']) .dropdown-menu.noclose.c1 li, .dropdown:has(button .value[data-placeholder='Sort by']) .dropdown-menu.noclose.c1 li")
    };
  }

  function makeTagSection(id, label, values, prefix) {
    return App.createTagSection({
      id,
      label,
      tags: (values ?? []).map((value) => App.createTag({
        id: tagId(prefix, value.id),
        label: value.label
      }))
    });
  }

  async function parseSearchResultsPage(source, url) {
    var request = App.createRequest({ url, method: "GET" });
    var response = await source.requestManager.schedule(request, 1);
    source.CloudFlareError(response.status);
    var $ = load(toArrayData(response.data));
    var items = [];
    $(".original.card-lg .unit .inner").each((_idx, node) => {
      var item = $(node);
      var link = item.find(".info > a").first();
      var title = link.text().trim();
      var mangaId = parseMangaIdFromUrl(link.attr("href"));
      var image = item.find("img").attr("src") ?? "";
      var chapterMatch = item.find(".content[data-name='chap'] a").first().find("span").first().text().trim().match(/Chap\s+([\d.]+)/i);
      var subtitle = chapterMatch ? `Ch. ${chapterMatch[1]}` : "";
      if (!title || !mangaId) return;
      items.push(App.createPartialSourceManga({
        mangaId,
        image,
        title,
        subtitle
      }));
    });
    var hasNextPage = !!$(".page-item.active + .page-item .page-link").length;
    return { items, hasNextPage };
  }

  function parseFilterTiles($) {
    var results = [];
    $(".unit .inner").each((_idx, node) => {
      var item = $(node);
      var link = item.find(".info > a").last();
      var title = link.text().trim();
      var mangaId = parseMangaIdFromUrl(link.attr("href"));
      var image = item.find(".poster img").attr("src") ?? "";
      var chapterMatch = item.find(".content[data-name='chap'] a").first().find("span").first().text().trim().match(/Chap\s+([\d.]+)/i);
      var subtitle = chapterMatch ? `Ch. ${chapterMatch[1]}` : "";
      if (!title || !mangaId) return;
      results.push({ mangaId, image, title, subtitle });
    });
    return results;
  }

  var _MangaFire = class _MangaFire {
    constructor() {
      this.requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15e3,
        interceptor: {
          interceptRequest: async (request) => {
            request.headers = {
              ...request.headers ?? {},
              referer: `${MF_DOMAIN}/`,
              "user-agent": await this.requestManager.getDefaultUserAgent()
            };
            return request;
          },
          interceptResponse: async (response) => response
        }
      });
      this.stateManager = App.createSourceStateManager();
    }
    CloudFlareError(status) {
      if (status == 503 || status == 403) {
        throw new Error(
          `CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${_MangaFire.name}> and press the cloud icon.`
        );
      }
    }
    async getCloudflareBypassRequestAsync() {
      return App.createRequest({
        url: MF_DOMAIN,
        method: "GET",
        headers: {
          referer: `${MF_DOMAIN}/`,
          "user-agent": await this.requestManager.getDefaultUserAgent()
        }
      });
    }
    getMangaShareUrl(mangaId) {
      return `${MF_DOMAIN}/manga/${mangaId}`;
    }
    async getSearchTags() {
      var options = await parseSearchOptions(this);
      return [
        makeTagSection("0", "Type", options.types, "type"),
        makeTagSection("1", "Genres", options.genres, "genre"),
        makeTagSection("2", "Status", options.statuses, "status"),
        makeTagSection("3", "Language", options.languages, "language"),
        makeTagSection("4", "Year", options.years, "year"),
        makeTagSection("5", "Length", options.lengths, "length"),
        makeTagSection("6", "Sort", options.sorts, "sort")
      ];
    }
    async supportsTagExclusion() {
      return true;
    }
    async getSearchResults(query, metadata) {
      var page = metadata?.page ?? 1;
      var title = query?.title ?? "";
      var includedType = getIncludedTagValues(query?.includedTags, "type")[0];
      var includedStatus = getIncludedTagValues(query?.includedTags, "status")[0];
      var includedLanguage = getIncludedTagValues(query?.includedTags, "language")[0];
      var includedYear = getIncludedTagValues(query?.includedTags, "year")[0];
      var includedLength = getIncludedTagValues(query?.includedTags, "length")[0];
      var includedSort = getIncludedTagValues(query?.includedTags, "sort")[0];
      var includedGenres = getIncludedTagValues(query?.includedTags, "genre");
      var excludedGenres = getExcludedTagValues(query?.excludedTags, "genre");
      var builder = new URLBuilder(MF_DOMAIN).addPathComponent("filter").addQueryParameter("keyword", title).addQueryParameter("page", String(page)).addQueryParameter("genre_mode", "and").addQueryParameter("vrf", generateVRF(title));
      if (includedType) builder.addQueryParameter("type[]", includedType);
      if (includedStatus) builder.addQueryParameter("status[]", includedStatus);
      if (includedLanguage) builder.addQueryParameter("language[]", includedLanguage);
      if (includedYear) builder.addQueryParameter("year[]", includedYear);
      if (includedLength) builder.addQueryParameter("minchap", includedLength);
      if (includedSort) builder.addQueryParameter("sort", includedSort);
      includedGenres.forEach((genreId) => builder.addQueryParameter("genre[]", genreId));
      excludedGenres.forEach((genreId) => builder.addQueryParameter("genre[]", `-${genreId}`));
      var { items, hasNextPage } = await parseSearchResultsPage(this, builder.buildUrl());
      return App.createPagedResults({
        results: items,
        metadata: hasNextPage ? { page: page + 1 } : void 0
      });
    }
    async getMangaDetails(mangaId) {
      var request = App.createRequest({
        url: new URLBuilder(MF_DOMAIN).addPathComponent("manga").addPathComponent(mangaId).buildUrl(),
        method: "GET"
      });
      var response = await this.requestManager.schedule(request, 1);
      this.CloudFlareError(response.status);
      var $ = load(toArrayData(response.data));
      var title = $(".manga-detail .info h1").first().text().trim();
      var secondary = $(".manga-detail .info h6").first().text().trim();
      var image = $(".manga-detail .poster img").attr("src") ?? "";
      var synopsis = $("#synopsis .modal-content").text().trim() || $(".manga-detail .info .description").text().trim() || "";
      var authors = [];
      $("#info-rating .meta div").each((_idx, node) => {
        var sectionName = $(node).find("span").first().text().trim();
        if (sectionName !== "Author:") return;
        $(node).find("a").each((_aIdx, authorNode) => {
          var author = $(authorNode).text().trim();
          if (author) authors.push(author);
        });
      });
      var rawStatus = "";
      $(".manga-detail .info p").each((_idx, node) => {
        var text = $(node).text().trim();
        if (text) rawStatus = text;
      });
      var genreLabels = [];
      $("#info-rating .meta div").each((_idx, node) => {
        var sectionName = $(node).find("span").first().text().trim();
        if (sectionName !== "Genres:") return;
        $(node).find("a").each((_gIdx, genreNode) => {
          var genre = $(genreNode).text().trim();
          if (genre) genreLabels.push(genre);
        });
      });
      var genreTagSection = App.createTagSection({
        id: "genres",
        label: "Genres",
        tags: genreLabels.map((genre) => App.createTag({
          id: genre.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
          label: genre
        }))
      });
      return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
          titles: secondary ? [title, secondary] : [title],
          image,
          desc: synopsis,
          status: parseStatus(rawStatus),
          author: authors.join(", "),
          artist: authors.join(", "),
          tags: genreLabels.length ? [genreTagSection] : []
        })
      });
    }
    async getChapters(mangaId) {
      var compactId = mangaId.split(".").pop() ?? mangaId;
      var chapters = [];
      for (var language of SUPPORTED_LANGUAGES) {
        var chapterListVrf = generateVRF(`${compactId}@chapter@${language.code}`);
        var readRequest = App.createRequest({
          url: new URLBuilder(MF_DOMAIN).addPathComponent("ajax").addPathComponent("read").addPathComponent(compactId).addPathComponent("chapter").addPathComponent(language.code).addQueryParameter("vrf", chapterListVrf).buildUrl(),
          method: "GET"
        });
        try {
          var readResponse = await this.requestManager.schedule(readRequest, 1);
          this.CloudFlareError(readResponse.status);
          var readJson = JSON.parse(toArrayData(readResponse.data));
          var chapterReferenceHtml = typeof readJson?.result === "string" ? readJson.result : readJson?.result?.html ?? "";
          if (!chapterReferenceHtml) {
            continue;
          }
          var reference$ = load(chapterReferenceHtml);
          var chapterIdByNumber = /* @__PURE__ */ new Map();
          reference$("li").each((_idx, node) => {
            var chapterAnchor = reference$(node).find("a");
            var chapterNumber = chapterAnchor.attr("data-number");
            var chapterId2 = chapterAnchor.attr("data-id");
            if (!chapterNumber || !chapterId2) return;
            chapterIdByNumber.set(parseFloat(chapterNumber), chapterId2);
          });
          var detailsRequest = App.createRequest({
            url: new URLBuilder(MF_DOMAIN).addPathComponent("ajax").addPathComponent("manga").addPathComponent(compactId).addPathComponent("chapter").addPathComponent(language.code).buildUrl(),
            method: "GET"
          });
          var detailsResponse = await this.requestManager.schedule(detailsRequest, 1);
          this.CloudFlareError(detailsResponse.status);
          var detailsJson = JSON.parse(toArrayData(detailsResponse.data));
          var detailsHtml = typeof detailsJson?.result === "string" ? detailsJson.result : detailsJson?.result?.html ?? "";
          if (!detailsHtml) {
            continue;
          }
          var detail$ = load(detailsHtml);
          detail$("li").each((_idx, node) => {
            var listItem = detail$(node);
            var chapterNumberRaw = listItem.attr("data-number");
            if (!chapterNumberRaw) return;
            var chapterNumber2 = parseFloat(chapterNumberRaw);
            var rawChapterId = chapterIdByNumber.get(chapterNumber2);
            if (!rawChapterId) return;
            var anchor = listItem.find("a");
            var dateText = listItem.find("span").last().text().trim();
            var firstSpanText = anchor.find("span").first().text().trim();
            var cleanedTitle = firstSpanText.split(`${chapterNumberRaw}:`)[1]?.trim() || firstSpanText.replace(/Chap\s+[\d.]+/i, "").trim() || void 0;
            var chapterId2 = `${rawChapterId}|${language.code}`;
            chapters.push({
              id: chapterId2,
              name: cleanedTitle ? `Ch. ${chapterNumberRaw} - ${cleanedTitle}` : `Ch. ${chapterNumberRaw}`,
              chapNum: parseChapterNumber(chapterNumberRaw),
              volume: 0,
              langCode: language.flag,
              group: language.short,
              time: parseDateString(dateText),
              sortingIndex: 0
            });
          });
        } catch (_error) {
          continue;
        }
      }
      chapters.sort((a, b) => {
        if (a.chapNum === b.chapNum) {
          return a.id < b.id ? -1 : 1;
        }
        return a.chapNum - b.chapNum;
      });
      return chapters.map((chapter, index) => {
        chapter.sortingIndex = index;
        return App.createChapter(chapter);
      });
    }
    async getChapterDetails(mangaId, chapterId) {
      var rawChapterId = chapterId.split("|")[0] ?? chapterId;
      var vrf = generateVRF(`chapter@${rawChapterId}`);
      var request = App.createRequest({
        url: new URLBuilder(MF_DOMAIN).addPathComponent("ajax").addPathComponent("read").addPathComponent("chapter").addPathComponent(rawChapterId).addQueryParameter("vrf", vrf).buildUrl(),
        method: "GET"
      });
      var response = await this.requestManager.schedule(request, 1);
      this.CloudFlareError(response.status);
      var data = JSON.parse(toArrayData(response.data));
      var images = data?.result?.images ?? [];
      var pages = images.map((entry) => entry[0]).filter(Boolean);
      return App.createChapterDetails({
        id: chapterId,
        mangaId,
        pages
      });
    }
    async getHomePageSections(sectionCallback) {
      var popularSection = App.createHomeSection({
        id: "popular_section",
        title: "Popular",
        containsMoreItems: true,
        type: PBHomeSectionType.singleRowLarge
      });
      var updatedSection = App.createHomeSection({
        id: "updated_section",
        title: "Recently Updated",
        containsMoreItems: true,
        type: PBHomeSectionType.singleRowNormal
      });
      var newSection = App.createHomeSection({
        id: "new_manga_section",
        title: "New Manga",
        containsMoreItems: true,
        type: PBHomeSectionType.singleRowNormal
      });
      var popularUrl = new URLBuilder(MF_DOMAIN).addPathComponent("filter").addQueryParameter("keyword", "").addQueryParameter("language[]", "en").addQueryParameter("sort", "most_viewed").addQueryParameter("page", "1").buildUrl();
      var popularPage = await parseSearchResultsPage(this, popularUrl);
      popularSection.items = popularPage.items;
      sectionCallback(popularSection);
      var updatedUrl = new URLBuilder(MF_DOMAIN).addPathComponent("filter").addQueryParameter("keyword", "").addQueryParameter("language[]", "en").addQueryParameter("sort", "recently_updated").addQueryParameter("page", "1").buildUrl();
      var updatedPage = await parseSearchResultsPage(this, updatedUrl);
      updatedSection.items = updatedPage.items;
      sectionCallback(updatedSection);
      var addedRequest = App.createRequest({
        url: `${MF_DOMAIN}/added?page=1`,
        method: "GET"
      });
      var addedResponse = await this.requestManager.schedule(addedRequest, 1);
      this.CloudFlareError(addedResponse.status);
      var added$ = load(toArrayData(addedResponse.data));
      var addedItems = parseFilterTiles(added$).map((item) => App.createPartialSourceManga({
        mangaId: item.mangaId,
        image: item.image,
        title: item.title,
        subtitle: item.subtitle
      }));
      newSection.items = addedItems;
      sectionCallback(newSection);
    }
    async getViewMoreItems(homepageSectionId, metadata) {
      var page = metadata?.page ?? 1;
      var url = "";
      if (homepageSectionId === "popular_section") {
        url = new URLBuilder(MF_DOMAIN).addPathComponent("filter").addQueryParameter("keyword", "").addQueryParameter("language[]", "en").addQueryParameter("sort", "most_viewed").addQueryParameter("page", String(page)).buildUrl();
      } else if (homepageSectionId === "updated_section") {
        url = new URLBuilder(MF_DOMAIN).addPathComponent("filter").addQueryParameter("keyword", "").addQueryParameter("language[]", "en").addQueryParameter("sort", "recently_updated").addQueryParameter("page", String(page)).buildUrl();
      } else if (homepageSectionId === "new_manga_section") {
        url = `${MF_DOMAIN}/added?page=${page}`;
      } else {
        throw new Error("Requested to getViewMoreItems for a section ID which doesn't exist");
      }
      if (homepageSectionId === "new_manga_section") {
        var request = App.createRequest({ url, method: "GET" });
        var response = await this.requestManager.schedule(request, 1);
        this.CloudFlareError(response.status);
        var $ = load(toArrayData(response.data));
        var parsed = parseFilterTiles($).map((item) => App.createPartialSourceManga({
          mangaId: item.mangaId,
          image: item.image,
          title: item.title,
          subtitle: item.subtitle
        }));
        var hasNext = !!$(".page-item.active + .page-item .page-link").length;
        return App.createPagedResults({
          results: parsed,
          metadata: hasNext ? { page: page + 1 } : void 0
        });
      }
      var parsedPage = await parseSearchResultsPage(this, url);
      return App.createPagedResults({
        results: parsedPage.items,
        metadata: parsedPage.hasNextPage ? { page: page + 1 } : void 0
      });
    }
  };
  var MangaFire = _MangaFire;
  return __toCommonJS(MangaFire_exports);
})();
this.Sources = _Sources; if (typeof exports === 'object' && typeof module !== 'undefined') {module.exports.Sources = this.Sources;}
