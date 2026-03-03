import {
    Chapter,
    ChapterDetails,
    ChapterProviding,
    ContentRating,
    HomePageSectionsProviding,
    HomeSection,
    HomeSectionType,
    MangaProviding,
    PagedResults,
    PartialSourceManga,
    Request,
    RequestManager,
    Response,
    SearchRequest,
    SearchResultsProviding,
    SourceInfo,
    SourceIntents,
    SourceManga,
    SourceStateManager,
    TagSection
} from '@paperback/types'

import * as cheerio from 'cheerio'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MF_DOMAIN = 'https://mangafire.to'

interface LanguageEntry {
    code: string
    label: string
    flag: string
    short: string
}

const SUPPORTED_LANGUAGES: LanguageEntry[] = [
    { code: 'en', label: 'English', flag: '\u{1F1EC}\u{1F1E7}', short: 'EN' },
    { code: 'fr', label: 'French', flag: '\u{1F1EB}\u{1F1F7}', short: 'FR' },
    { code: 'es', label: 'Spanish', flag: '\u{1F1EA}\u{1F1F8}', short: 'ES' },
    { code: 'es-la', label: 'Spanish (LATAM)', flag: '\u{1F1F2}\u{1F1FD}', short: 'ESLA' },
    { code: 'pt', label: 'Portuguese', flag: '\u{1F1F5}\u{1F1F9}', short: 'PT' },
    { code: 'pt-br', label: 'Portuguese (Br)', flag: '\u{1F1E7}\u{1F1F7}', short: 'PTBR' },
    { code: 'ja', label: 'Japanese', flag: '\u{1F1EF}\u{1F1F5}', short: 'JP' }
]

// ---------------------------------------------------------------------------
// Source Info
// ---------------------------------------------------------------------------

export const MangaFireInfo: SourceInfo = {
    version: '1.0.0',
    name: 'MangaFire',
    description: 'Extension that pulls manga from MangaFire',
    author: 'Codex',
    authorWebsite: 'https://github.com/openai',
    icon: 'icon.png',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: MF_DOMAIN,
    intents:
        SourceIntents.MANGA_CHAPTERS |
        SourceIntents.HOMEPAGE_SECTIONS |
        SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
    sourceTags: []
}

// ---------------------------------------------------------------------------
// URL Builder
// ---------------------------------------------------------------------------

class URLBuilder {
    private baseUrl: string
    private pathParts: string[] = []
    private queryPairs: [string, string][] = []

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/+$/g, '')
    }

    addPathComponent(part: string): this {
        this.pathParts.push(String(part).replace(/^\/+|\/+$/g, ''))
        return this
    }

    addQueryParameter(key: string, value: string | string[] | undefined | null): this {
        if (value === undefined || value === null || value === '') {
            return this
        }

        if (Array.isArray(value)) {
            value.forEach((entry) => {
                if (entry !== undefined && entry !== null && entry !== '') {
                    this.queryPairs.push([key, String(entry)])
                }
            })
            return this
        }

        this.queryPairs.push([key, String(value)])
        return this
    }

    buildUrl(): string {
        const path = this.pathParts.length > 0 ? `/${this.pathParts.join('/')}` : ''
        if (this.queryPairs.length === 0) {
            return `${this.baseUrl}${path}`
        }

        const query = this.queryPairs
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&')

        return `${this.baseUrl}${path}?${query}`
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDateString(raw: string | undefined | null): Date {
    const now = new Date()
    const value = (raw ?? '').trim()

    if (!value) return now
    if (/^yesterday$/i.test(value)) {
        now.setDate(now.getDate() - 1)
        return now
    }

    const relative = value.match(/(\d+)\s+(second|minute|hour|day)s?\s+ago/i)
    if (relative) {
        const amount = Number(relative[1])
        const unit = relative[2]!.toLowerCase()

        if (unit === 'second') now.setSeconds(now.getSeconds() - amount)
        if (unit === 'minute') now.setMinutes(now.getMinutes() - amount)
        if (unit === 'hour') now.setHours(now.getHours() - amount)
        if (unit === 'day') now.setDate(now.getDate() - amount)
        return now
    }

    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return now
    return parsed
}

function parseStatus(rawStatus: string | undefined | null): string {
    const value = (rawStatus ?? '').toLowerCase()
    if (value.includes('releasing')) return 'ONGOING'
    if (value.includes('completed')) return 'COMPLETED'
    if (value.includes('hiatus')) return 'HIATUS'
    if (value.includes('discontinued')) return 'UNKNOWN'
    if (value.includes('not yet published')) return 'UNKNOWN'
    return 'UNKNOWN'
}

function tagId(section: string, value: string): string {
    return `${section}:${value}`
}

function parseTagValue(tag: { id: string } | undefined | null, section: string): string {
    if (!tag?.id?.startsWith(`${section}:`)) return ''
    return tag.id.slice(section.length + 1)
}

function getIncludedTagValues(tags: { id: string }[] | undefined | null, section: string): string[] {
    return (tags ?? []).map((tag) => parseTagValue(tag, section)).filter(Boolean)
}

function getExcludedTagValues(tags: { id: string }[] | undefined | null, section: string): string[] {
    return (tags ?? []).map((tag) => parseTagValue(tag, section)).filter(Boolean)
}

function parseMangaIdFromUrl(url: string | undefined | null): string {
    const path = (url ?? '').replace(/\/$/, '').split('/').pop() ?? ''
    return path
}

function parseChapterNumber(raw: string | number | undefined | null): number {
    const value = String(raw ?? '').trim()
    const asFloat = parseFloat(value)
    return Number.isNaN(asFloat) ? 0 : asFloat
}

function toArrayData(responseData: unknown): string {
    if (typeof responseData === 'string') return responseData
    if (responseData != null && typeof (responseData as { toString?: () => string }).toString === 'function') {
        return (responseData as { toString: () => string }).toString()
    }
    return String(responseData ?? '')
}

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='

function safeAtob(str: string): string {
    if (typeof atob === 'function') return atob(str)
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'base64').toString('binary')
    // Manual base64 decode for environments without atob/Buffer (e.g. Paperback runtime)
    let output = ''
    const input = str.replace(/=+$/, '')
    for (let i = 0; i < input.length; i += 4) {
        const a = B64_CHARS.indexOf(input[i]!)
        const b = B64_CHARS.indexOf(input[i + 1]!)
        const c = B64_CHARS.indexOf(input[i + 2] ?? '=')
        const d = B64_CHARS.indexOf(input[i + 3] ?? '=')
        const bits = (a << 18) | (b << 12) | (c << 6) | d
        output += String.fromCharCode((bits >> 16) & 0xff)
        if (input[i + 2] !== undefined) output += String.fromCharCode((bits >> 8) & 0xff)
        if (input[i + 3] !== undefined) output += String.fromCharCode(bits & 0xff)
    }
    return output
}

function safeBtoa(str: string): string {
    if (typeof btoa === 'function') return btoa(str)
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'binary').toString('base64')
    // Manual base64 encode for environments without btoa/Buffer
    let output = ''
    for (let i = 0; i < str.length; i += 3) {
        const a = str.charCodeAt(i)
        const b = i + 1 < str.length ? str.charCodeAt(i + 1) : 0
        const c = i + 2 < str.length ? str.charCodeAt(i + 2) : 0
        const bits = (a << 16) | (b << 8) | c
        output += B64_CHARS[(bits >> 18) & 0x3f]
        output += B64_CHARS[(bits >> 12) & 0x3f]
        output += i + 1 < str.length ? B64_CHARS[(bits >> 6) & 0x3f] : '='
        output += i + 2 < str.length ? B64_CHARS[bits & 0x3f] : '='
    }
    return output
}

function toBytes(str: string): number[] {
    return Array.from(str, (char) => char.charCodeAt(0) & 0xff)
}

function fromBytes(bytes: number[]): string {
    return bytes.map((byte) => String.fromCharCode(byte & 0xff)).join('')
}

// ---------------------------------------------------------------------------
// RC4 + VRF Crypto
// ---------------------------------------------------------------------------

function rc4Bytes(key: string, input: number[]): number[] {
    const state = Array.from({ length: 256 }, (_, i) => i)
    let j = 0

    for (let i = 0; i < 256; i++) {
        j = (j + state[i]! + key.charCodeAt(i % key.length)) & 0xff;
        [state[i], state[j]] = [state[j]!, state[i]!]
    }

    const output = new Array<number>(input.length)
    let ii = 0
    j = 0
    for (let y = 0; y < input.length; y++) {
        ii = (ii + 1) & 0xff
        j = (j + state[ii]!) & 0xff;
        [state[ii], state[j]] = [state[j]!, state[ii]!]
        const k = state[(state[ii]! + state[j]!) & 0xff]!
        output[y] = (input[y]! ^ k) & 0xff
    }

    return output
}

type ByteTransformFn = (c: number) => number

function transform(
    input: number[],
    initSeedBytes: number[],
    prefixKeyString: string,
    prefixLen: number,
    schedule: ByteTransformFn[]
): number[] {
    const output: number[] = []
    for (let i = 0; i < input.length; i++) {
        if (i < prefixLen) {
            output.push(prefixKeyString.charCodeAt(i) & 0xff)
        }

        output.push(schedule[i % 10]!((input[i]! ^ initSeedBytes[i % 32]!) & 0xff) & 0xff)
    }
    return output
}

const add8 = (n: number): ByteTransformFn => (c: number) => (c + n) & 0xff
const sub8 = (n: number): ByteTransformFn => (c: number) => (c - n + 256) & 0xff
const xor8 = (n: number): ByteTransformFn => (c: number) => (c ^ n) & 0xff
const rotl8 = (n: number): ByteTransformFn => (c: number) => ((c << n) | (c >>> (8 - n))) & 0xff

const scheduleC: ByteTransformFn[] = [
    sub8(48), sub8(19), xor8(241), sub8(19), add8(223),
    sub8(19), sub8(170), sub8(19), sub8(48), xor8(8)
]

const scheduleY: ByteTransformFn[] = [
    rotl8(4), add8(223), rotl8(4), xor8(163), sub8(48),
    add8(82), add8(223), sub8(48), xor8(83), rotl8(4)
]

const scheduleB: ByteTransformFn[] = [
    sub8(19), add8(82), sub8(48), sub8(170), rotl8(4),
    sub8(48), sub8(170), xor8(8), add8(82), xor8(163)
]

const scheduleJ: ByteTransformFn[] = [
    add8(223), rotl8(4), add8(223), xor8(83), sub8(19),
    add8(223), sub8(170), add8(223), sub8(170), xor8(83)
]

const scheduleE: ByteTransformFn[] = [
    add8(82), xor8(83), xor8(163), add8(82), sub8(170),
    xor8(8), xor8(241), add8(82), add8(176), rotl8(4)
]

const RC4_KEYS: Record<string, string> = {
    l: 'u8cBwTi1CM4XE3BkwG5Ble3AxWgnhKiXD9Cr279yNW0=',
    g: 't00NOJ/Fl3wZtez1xU6/YvcWDoXzjrDHJLL2r/IWgcY=',
    B: 'S7I+968ZY4Fo3sLVNH/ExCNq7gjuOHjSRgSqh6SsPJc=',
    m: '7D4Q8i8dApRj6UWxXbIBEa1UqvjI+8W0UvPH9talJK8=',
    F: '0JsmfWZA1kwZeWLk5gfV5g41lwLL72wHbam5ZPfnOVE='
}

const SEEDS32: Record<string, string> = {
    A: 'pGjzSCtS4izckNAOhrY5unJnO2E1VbrU+tXRYG24vTo=',
    V: 'dFcKX9Qpu7mt/AD6mb1QF4w+KqHTKmdiqp7penubAKI=',
    N: 'owp1QIY/kBiRWrRn9TLN2CdZsLeejzHhfJwdiQMjg3w=',
    P: 'H1XbRvXOvZAhyyPaO68vgIUgdAHn68Y6mrwkpIpEue8=',
    k: '2Nmobf/mpQ7+Dxq1/olPSDj3xV8PZkPbKaucJvVckL0='
}

const PREFIX_KEYS: Record<string, string> = {
    O: 'Rowe+rg/0g==',
    v: '8cULcnOMJVY8AA==',
    L: 'n2+Og2Gth8Hh',
    p: 'aRpvzH+yoA==',
    W: 'ZB4oBi0='
}

function bytesFromBase64(base64: string): number[] {
    return toBytes(safeAtob(base64))
}

function base64UrlEncodeBytes(bytes: number[]): string {
    const std = safeBtoa(fromBytes(bytes))
    return std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generateVRF(input: string): string {
    let bytes = toBytes(encodeURIComponent(input))

    bytes = rc4Bytes(safeAtob(RC4_KEYS['l']!), bytes)
    bytes = transform(bytes, bytesFromBase64(SEEDS32['A']!), safeAtob(PREFIX_KEYS['O']!), 7, scheduleC)

    bytes = rc4Bytes(safeAtob(RC4_KEYS['g']!), bytes)
    bytes = transform(bytes, bytesFromBase64(SEEDS32['V']!), safeAtob(PREFIX_KEYS['v']!), 10, scheduleY)

    bytes = rc4Bytes(safeAtob(RC4_KEYS['B']!), bytes)
    bytes = transform(bytes, bytesFromBase64(SEEDS32['N']!), safeAtob(PREFIX_KEYS['L']!), 9, scheduleB)

    bytes = rc4Bytes(safeAtob(RC4_KEYS['m']!), bytes)
    bytes = transform(bytes, bytesFromBase64(SEEDS32['P']!), safeAtob(PREFIX_KEYS['p']!), 7, scheduleJ)

    bytes = rc4Bytes(safeAtob(RC4_KEYS['F']!), bytes)
    bytes = transform(bytes, bytesFromBase64(SEEDS32['k']!), safeAtob(PREFIX_KEYS['W']!), 5, scheduleE)

    return base64UrlEncodeBytes(bytes)
}

// ---------------------------------------------------------------------------
// Search option parsing
// ---------------------------------------------------------------------------

interface FilterOption {
    id: string
    label: string
}

interface SearchOptions {
    types: FilterOption[]
    genres: FilterOption[]
    statuses: FilterOption[]
    languages: FilterOption[]
    years: FilterOption[]
    lengths: FilterOption[]
    sorts: FilterOption[]
}

async function parseSearchOptions(source: MangaFire): Promise<SearchOptions> {
    const request = App.createRequest({
        url: `${MF_DOMAIN}/filter`,
        method: 'GET'
    })

    const response = await source.requestManager.schedule(request, 1)
    source.CloudFlareError(response.status)

    const $ = cheerio.load(toArrayData(response.data))

    const parseDropdownOptions = (selector: string): FilterOption[] => {
        const items: FilterOption[] = []
        $(selector).each((_idx: number, node: cheerio.Element) => {
            const value = $(node).find('input').attr('value') ?? ''
            const label = $(node).find('label').text().trim()
            if (value && label) {
                items.push({ id: value, label })
            }
        })
        return items
    }

    return {
        types: parseDropdownOptions(".dropdown:has(button .value[data-placeholder='Type']) .dropdown-menu.noclose.c1 li"),
        genres: parseDropdownOptions('.genres li'),
        statuses: parseDropdownOptions(".dropdown:has(button .value[data-placeholder='Status']) .dropdown-menu.noclose.c1 li"),
        languages: parseDropdownOptions(".dropdown:has(button .value[data-placeholder='Language']) .dropdown-menu.noclose.c1 li"),
        years: parseDropdownOptions(".dropdown:has(button .value[data-placeholder='Year']) .dropdown-menu li"),
        lengths: parseDropdownOptions(".dropdown:has(button .value[data-placeholder='Length']) .dropdown-menu.noclose.c1 li"),
        sorts: parseDropdownOptions(
            ".dropdown:has(button .value[data-placeholder='Sort']) .dropdown-menu.noclose.c1 li, .dropdown:has(button .value[data-placeholder='Sort by']) .dropdown-menu.noclose.c1 li"
        )
    }
}

function makeTagSection(id: string, label: string, values: FilterOption[], prefix: string): TagSection {
    return App.createTagSection({
        id,
        label,
        tags: (values ?? []).map((value) =>
            App.createTag({
                id: tagId(prefix, value.id),
                label: value.label
            })
        )
    })
}

// ---------------------------------------------------------------------------
// Search results page parsing
// ---------------------------------------------------------------------------

interface ParsedSearchPage {
    items: PartialSourceManga[]
    hasNextPage: boolean
}

async function parseSearchResultsPage(source: MangaFire, url: string): Promise<ParsedSearchPage> {
    const request = App.createRequest({ url, method: 'GET' })
    const response = await source.requestManager.schedule(request, 1)
    source.CloudFlareError(response.status)

    const $ = cheerio.load(toArrayData(response.data))
    const items: PartialSourceManga[] = []

    $('.original.card-lg .unit .inner').each((_idx: number, node: cheerio.Element) => {
        const item = $(node)
        const link = item.find('.info > a').first()
        const title = link.text().trim()
        const mangaId = parseMangaIdFromUrl(link.attr('href'))
        const image = item.find('img').attr('src') ?? ''

        const chapterMatch = item
            .find(".content[data-name='chap'] a")
            .first()
            .find('span')
            .first()
            .text()
            .trim()
            .match(/Chap\s+([\d.]+)/i)

        const subtitle = chapterMatch ? `Ch. ${chapterMatch[1]}` : ''

        if (!title || !mangaId) return

        items.push(
            App.createPartialSourceManga({
                mangaId,
                image,
                title,
                subtitle
            })
        )
    })

    const hasNextPage = !!$('.page-item.active + .page-item .page-link').length
    return { items, hasNextPage }
}

// ---------------------------------------------------------------------------
// Filter tile parsing (for "added" / new manga pages)
// ---------------------------------------------------------------------------

interface FilterTile {
    mangaId: string
    image: string
    title: string
    subtitle: string
}

function parseFilterTiles($: cheerio.CheerioAPI): FilterTile[] {
    const results: FilterTile[] = []

    $('.unit .inner').each((_idx: number, node: cheerio.Element) => {
        const item = $(node)
        const link = item.find('.info > a').last()
        const title = link.text().trim()
        const mangaId = parseMangaIdFromUrl(link.attr('href'))
        const image = item.find('.poster img').attr('src') ?? ''

        const chapterMatch = item
            .find(".content[data-name='chap'] a")
            .first()
            .find('span')
            .first()
            .text()
            .trim()
            .match(/Chap\s+([\d.]+)/i)

        const subtitle = chapterMatch ? `Ch. ${chapterMatch[1]}` : ''

        if (!title || !mangaId) return

        results.push({ mangaId, image, title, subtitle })
    })

    return results
}

// ---------------------------------------------------------------------------
// MangaFire Source Class
// ---------------------------------------------------------------------------

export class MangaFire
    implements
        SearchResultsProviding,
        MangaProviding,
        ChapterProviding,
        HomePageSectionsProviding
{
    requestManager: RequestManager
    stateManager: SourceStateManager

    constructor() {
        this.requestManager = App.createRequestManager({
            requestsPerSecond: 4,
            requestTimeout: 15000,
            interceptor: {
                interceptRequest: async (request: Request): Promise<Request> => {
                    request.headers = {
                        ...(request.headers ?? {}),
                        referer: `${MF_DOMAIN}/`,
                        'user-agent': await this.requestManager.getDefaultUserAgent()
                    }
                    return request
                },
                interceptResponse: async (response: Response): Promise<Response> => {
                    return response
                }
            }
        })

        this.stateManager = App.createSourceStateManager()
    }

    CloudFlareError(status: number): void {
        if (status === 503 || status === 403) {
            throw new Error(
                `CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${MangaFire.name}> and press the cloud icon.`
            )
        }
    }

    async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({
            url: MF_DOMAIN,
            method: 'GET',
            headers: {
                referer: `${MF_DOMAIN}/`,
                'user-agent': await this.requestManager.getDefaultUserAgent()
            }
        })
    }

    getMangaShareUrl(mangaId: string): string {
        return `${MF_DOMAIN}/manga/${mangaId}`
    }

    async getSearchTags(): Promise<TagSection[]> {
        const options = await parseSearchOptions(this)

        return [
            makeTagSection('0', 'Type', options.types, 'type'),
            makeTagSection('1', 'Genres', options.genres, 'genre'),
            makeTagSection('2', 'Status', options.statuses, 'status'),
            makeTagSection('3', 'Language', options.languages, 'language'),
            makeTagSection('4', 'Year', options.years, 'year'),
            makeTagSection('5', 'Length', options.lengths, 'length'),
            makeTagSection('6', 'Sort', options.sorts, 'sort')
        ]
    }

    async supportsTagExclusion(): Promise<boolean> {
        return true
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
        const title: string = query?.title ?? ''

        const includedType = getIncludedTagValues(query?.includedTags, 'type')[0]
        const includedStatus = getIncludedTagValues(query?.includedTags, 'status')[0]
        const includedLanguage = getIncludedTagValues(query?.includedTags, 'language')[0]
        const includedYear = getIncludedTagValues(query?.includedTags, 'year')[0]
        const includedLength = getIncludedTagValues(query?.includedTags, 'length')[0]
        const includedSort = getIncludedTagValues(query?.includedTags, 'sort')[0]

        const includedGenres = getIncludedTagValues(query?.includedTags, 'genre')
        const excludedGenres = getExcludedTagValues(query?.excludedTags, 'genre')

        const builder = new URLBuilder(MF_DOMAIN)
            .addPathComponent('filter')
            .addQueryParameter('keyword', title)
            .addQueryParameter('page', String(page))
            .addQueryParameter('genre_mode', 'and')
            .addQueryParameter('vrf', generateVRF(title))

        if (includedType) builder.addQueryParameter('type[]', includedType)
        if (includedStatus) builder.addQueryParameter('status[]', includedStatus)
        if (includedLanguage) builder.addQueryParameter('language[]', includedLanguage)
        if (includedYear) builder.addQueryParameter('year[]', includedYear)
        if (includedLength) builder.addQueryParameter('minchap', includedLength)
        if (includedSort) builder.addQueryParameter('sort', includedSort)

        includedGenres.forEach((genreId) => builder.addQueryParameter('genre[]', genreId))
        excludedGenres.forEach((genreId) => builder.addQueryParameter('genre[]', `-${genreId}`))

        const { items, hasNextPage } = await parseSearchResultsPage(this, builder.buildUrl())

        return App.createPagedResults({
            results: items,
            metadata: hasNextPage ? { page: page + 1 } : undefined
        })
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = App.createRequest({
            url: new URLBuilder(MF_DOMAIN).addPathComponent('manga').addPathComponent(mangaId).buildUrl(),
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)

        const $ = cheerio.load(toArrayData(response.data))
        const title = $('.manga-detail .info h1').first().text().trim()
        const secondary = $('.manga-detail .info h6').first().text().trim()
        const image = $('.manga-detail .poster img').attr('src') ?? ''

        const synopsis =
            $('#synopsis .modal-content').text().trim() ||
            $('.manga-detail .info .description').text().trim() ||
            ''

        const authors: string[] = []
        $('#info-rating .meta div').each((_idx: number, node: cheerio.Element) => {
            const sectionName = $(node).find('span').first().text().trim()
            if (sectionName !== 'Author:') return

            $(node)
                .find('a')
                .each((_aIdx: number, authorNode: cheerio.Element) => {
                    const author = $(authorNode).text().trim()
                    if (author) authors.push(author)
                })
        })

        let rawStatus = ''
        $('.manga-detail .info p').each((_idx: number, node: cheerio.Element) => {
            const text = $(node).text().trim()
            if (text) rawStatus = text
        })

        const genreLabels: string[] = []
        $('#info-rating .meta div').each((_idx: number, node: cheerio.Element) => {
            const sectionName = $(node).find('span').first().text().trim()
            if (sectionName !== 'Genres:') return

            $(node)
                .find('a')
                .each((_gIdx: number, genreNode: cheerio.Element) => {
                    const genre = $(genreNode).text().trim()
                    if (genre) genreLabels.push(genre)
                })
        })

        const genreTagSection = App.createTagSection({
            id: 'genres',
            label: 'Genres',
            tags: genreLabels.map((genre) =>
                App.createTag({
                    id: genre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                    label: genre
                })
            )
        })

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: secondary ? [title, secondary] : [title],
                image,
                desc: synopsis,
                status: parseStatus(rawStatus),
                author: authors.join(', '),
                artist: authors.join(', '),
                tags: genreLabels.length ? [genreTagSection] : []
            })
        })
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const compactId = mangaId.split('.').pop() ?? mangaId

        interface RawChapter {
            id: string
            name: string
            chapNum: number
            volume: number
            langCode: string
            group: string
            time: Date
            sortingIndex: number
        }

        const chapters: RawChapter[] = []

        for (const language of SUPPORTED_LANGUAGES) {
            const chapterListVrf = generateVRF(`${compactId}@chapter@${language.code}`)

            const readRequest = App.createRequest({
                url: new URLBuilder(MF_DOMAIN)
                    .addPathComponent('ajax')
                    .addPathComponent('read')
                    .addPathComponent(compactId)
                    .addPathComponent('chapter')
                    .addPathComponent(language.code)
                    .addQueryParameter('vrf', chapterListVrf)
                    .buildUrl(),
                method: 'GET'
            })

            try {
                const readResponse = await this.requestManager.schedule(readRequest, 1)
                this.CloudFlareError(readResponse.status)

                const readJson = JSON.parse(toArrayData(readResponse.data))
                const chapterReferenceHtml: string =
                    typeof readJson?.result === 'string'
                        ? readJson.result
                        : (readJson?.result?.html ?? '')

                if (!chapterReferenceHtml) {
                    continue
                }

                const reference$ = cheerio.load(chapterReferenceHtml)
                const chapterIdByNumber = new Map<number, string>()

                reference$('li').each((_idx: number, node: cheerio.Element) => {
                    const chapterAnchor = reference$(node).find('a')
                    const chapterNumber = chapterAnchor.attr('data-number')
                    const chapterId = chapterAnchor.attr('data-id')

                    if (!chapterNumber || !chapterId) return
                    chapterIdByNumber.set(parseFloat(chapterNumber), chapterId)
                })

                const detailsRequest = App.createRequest({
                    url: new URLBuilder(MF_DOMAIN)
                        .addPathComponent('ajax')
                        .addPathComponent('manga')
                        .addPathComponent(compactId)
                        .addPathComponent('chapter')
                        .addPathComponent(language.code)
                        .buildUrl(),
                    method: 'GET'
                })

                const detailsResponse = await this.requestManager.schedule(detailsRequest, 1)
                this.CloudFlareError(detailsResponse.status)

                const detailsJson = JSON.parse(toArrayData(detailsResponse.data))
                const detailsHtml: string =
                    typeof detailsJson?.result === 'string'
                        ? detailsJson.result
                        : (detailsJson?.result?.html ?? '')

                if (!detailsHtml) {
                    continue
                }

                const detail$ = cheerio.load(detailsHtml)
                detail$('li').each((_idx: number, node: cheerio.Element) => {
                    const listItem = detail$(node)
                    const chapterNumberRaw = listItem.attr('data-number')
                    if (!chapterNumberRaw) return

                    const chapterNumber = parseFloat(chapterNumberRaw)
                    const rawChapterId = chapterIdByNumber.get(chapterNumber)
                    if (!rawChapterId) return

                    const anchor = listItem.find('a')
                    const dateText = listItem.find('span').last().text().trim()

                    const firstSpanText = anchor.find('span').first().text().trim()
                    const cleanedTitle =
                        firstSpanText.split(`${chapterNumberRaw}:`)[1]?.trim() ||
                        firstSpanText.replace(/Chap\s+[\d.]+/i, '').trim() ||
                        undefined

                    const chapterId = `${rawChapterId}|${language.code}`

                    chapters.push({
                        id: chapterId,
                        name: cleanedTitle ? `Ch. ${chapterNumberRaw} - ${cleanedTitle}` : `Ch. ${chapterNumberRaw}`,
                        chapNum: parseChapterNumber(chapterNumberRaw),
                        volume: 0,
                        langCode: language.flag,
                        group: language.short,
                        time: parseDateString(dateText),
                        sortingIndex: 0
                    })
                })
            } catch (_error) {
                continue
            }
        }

        chapters.sort((a, b) => {
            if (a.chapNum === b.chapNum) {
                return a.id < b.id ? -1 : 1
            }
            return a.chapNum - b.chapNum
        })

        return chapters.map((chapter, index) => {
            chapter.sortingIndex = index
            return App.createChapter(chapter)
        })
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const rawChapterId = chapterId.split('|')[0] ?? chapterId
        const vrf = generateVRF(`chapter@${rawChapterId}`)

        const request = App.createRequest({
            url: new URLBuilder(MF_DOMAIN)
                .addPathComponent('ajax')
                .addPathComponent('read')
                .addPathComponent('chapter')
                .addPathComponent(rawChapterId)
                .addQueryParameter('vrf', vrf)
                .buildUrl(),
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.CloudFlareError(response.status)

        const data = JSON.parse(toArrayData(response.data))
        const images: unknown[] = data?.result?.images ?? []
        const pages: string[] = images
            .map((entry: unknown) => (Array.isArray(entry) ? entry[0] as string : undefined))
            .filter((url): url is string => !!url)

        return App.createChapterDetails({
            id: chapterId,
            mangaId,
            pages
        })
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const popularSection = App.createHomeSection({
            id: 'popular_section',
            title: 'Popular',
            containsMoreItems: true,
            type: HomeSectionType.singleRowLarge
        })

        const updatedSection = App.createHomeSection({
            id: 'updated_section',
            title: 'Recently Updated',
            containsMoreItems: true,
            type: HomeSectionType.singleRowNormal
        })

        const newSection = App.createHomeSection({
            id: 'new_manga_section',
            title: 'New Manga',
            containsMoreItems: true,
            type: HomeSectionType.singleRowNormal
        })

        const popularUrl = new URLBuilder(MF_DOMAIN)
            .addPathComponent('filter')
            .addQueryParameter('keyword', '')
            .addQueryParameter('language[]', 'en')
            .addQueryParameter('sort', 'most_viewed')
            .addQueryParameter('page', '1')
            .buildUrl()

        const popularPage = await parseSearchResultsPage(this, popularUrl)
        popularSection.items = popularPage.items
        sectionCallback(popularSection)

        const updatedUrl = new URLBuilder(MF_DOMAIN)
            .addPathComponent('filter')
            .addQueryParameter('keyword', '')
            .addQueryParameter('language[]', 'en')
            .addQueryParameter('sort', 'recently_updated')
            .addQueryParameter('page', '1')
            .buildUrl()

        const updatedPage = await parseSearchResultsPage(this, updatedUrl)
        updatedSection.items = updatedPage.items
        sectionCallback(updatedSection)

        const addedRequest = App.createRequest({
            url: `${MF_DOMAIN}/added?page=1`,
            method: 'GET'
        })
        const addedResponse = await this.requestManager.schedule(addedRequest, 1)
        this.CloudFlareError(addedResponse.status)

        const added$ = cheerio.load(toArrayData(addedResponse.data))
        const addedItems = parseFilterTiles(added$).map((item) =>
            App.createPartialSourceManga({
                mangaId: item.mangaId,
                image: item.image,
                title: item.title,
                subtitle: item.subtitle
            })
        )

        newSection.items = addedItems
        sectionCallback(newSection)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
        let url = ''

        if (homepageSectionId === 'popular_section') {
            url = new URLBuilder(MF_DOMAIN)
                .addPathComponent('filter')
                .addQueryParameter('keyword', '')
                .addQueryParameter('language[]', 'en')
                .addQueryParameter('sort', 'most_viewed')
                .addQueryParameter('page', String(page))
                .buildUrl()
        } else if (homepageSectionId === 'updated_section') {
            url = new URLBuilder(MF_DOMAIN)
                .addPathComponent('filter')
                .addQueryParameter('keyword', '')
                .addQueryParameter('language[]', 'en')
                .addQueryParameter('sort', 'recently_updated')
                .addQueryParameter('page', String(page))
                .buildUrl()
        } else if (homepageSectionId === 'new_manga_section') {
            url = `${MF_DOMAIN}/added?page=${page}`
        } else {
            throw new Error("Requested to getViewMoreItems for a section ID which doesn't exist")
        }

        if (homepageSectionId === 'new_manga_section') {
            const request = App.createRequest({ url, method: 'GET' })
            const response = await this.requestManager.schedule(request, 1)
            this.CloudFlareError(response.status)

            const $ = cheerio.load(toArrayData(response.data))
            const parsed = parseFilterTiles($).map((item) =>
                App.createPartialSourceManga({
                    mangaId: item.mangaId,
                    image: item.image,
                    title: item.title,
                    subtitle: item.subtitle
                })
            )

            const hasNext = !!$('.page-item.active + .page-item .page-link').length
            return App.createPagedResults({
                results: parsed,
                metadata: hasNext ? { page: page + 1 } : undefined
            })
        }

        const parsedPage = await parseSearchResultsPage(this, url)
        return App.createPagedResults({
            results: parsedPage.items,
            metadata: parsedPage.hasNextPage ? { page: page + 1 } : undefined
        })
    }
}
