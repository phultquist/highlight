import {
	serializedNode,
	serializedNodeWithId,
	NodeType,
	attributes,
	MaskInputOptions,
	SlimDOMOptions,
	DataURLOptions,
	MaskTextFn,
	MaskInputFn,
	KeepIframeSrcFn,
	ICanvas,
	serializedElementNodeWithId,
} from './types'
import {
	Mirror,
	is2DCanvasBlank,
	isElement,
	isShadowRoot,
	maskInputValue,
	obfuscateText,
	isNativeShadowDom,
} from './utils'

let _id = 1
const tagNameRegex = new RegExp('[^a-z0-9-_:]')

export const IGNORED_NODE = -2

function genId(): number {
	return _id++
}

function getValidTagName(element: HTMLElement): string {
	if (element instanceof HTMLFormElement) {
		return 'form'
	}

	const processedTagName = element.tagName.toLowerCase().trim()

	if (tagNameRegex.test(processedTagName)) {
		// if the tag name is odd and we cannot extract
		// anything from the string, then we return a
		// generic div
		return 'div'
	}

	return processedTagName
}

function getCssRulesString(s: CSSStyleSheet): string | null {
	try {
		const rules = s.rules || s.cssRules
		return rules ? Array.from(rules).map(getCssRuleString).join('') : null
	} catch (error) {
		return null
	}
}

function getCssRuleString(rule: CSSRule): string {
	let cssStringified = rule.cssText
	if (isCSSImportRule(rule)) {
		try {
			cssStringified =
				getCssRulesString(rule.styleSheet) || cssStringified
		} catch {
			// ignore
		}
	}
	return cssStringified
}

function isCSSImportRule(rule: CSSRule): rule is CSSImportRule {
	return 'styleSheet' in rule
}

function stringifyStyleSheet(sheet: CSSStyleSheet): string {
	return sheet.cssRules
		? Array.from(sheet.cssRules)
				.map((rule) => rule.cssText || '')
				.join('')
		: ''
}

function extractOrigin(url: string): string {
	let origin = ''
	if (url.indexOf('//') > -1) {
		origin = url.split('/').slice(0, 3).join('/')
	} else {
		origin = url.split('/')[0]
	}
	origin = origin.split('?')[0]
	return origin
}

let canvasService: HTMLCanvasElement | null
let canvasCtx: CanvasRenderingContext2D | null

const URL_IN_CSS_REF = /url\((?:(')([^']*)'|(")(.*?)"|([^)]*))\)/gm
const RELATIVE_PATH = /^(?!www\.|(?:http|ftp)s?:\/\/|[A-Za-z]:\\|\/\/|#).*/
const DATA_URI = /^(data:)([^,]*),(.*)/i
export function absoluteToStylesheet(
	cssText: string | null,
	href: string,
): string {
	return (cssText || '').replace(
		URL_IN_CSS_REF,
		(
			origin: string,
			quote1: string,
			path1: string,
			quote2: string,
			path2: string,
			path3: string,
		) => {
			const filePath = path1 || path2 || path3
			const maybeQuote = quote1 || quote2 || ''
			if (!filePath) {
				return origin
			}
			if (!RELATIVE_PATH.test(filePath)) {
				return `url(${maybeQuote}${filePath}${maybeQuote})`
			}
			if (DATA_URI.test(filePath)) {
				return `url(${maybeQuote}${filePath}${maybeQuote})`
			}
			if (filePath[0] === '/') {
				return `url(${maybeQuote}${
					extractOrigin(href) + filePath
				}${maybeQuote})`
			}
			const stack = href.split('/')
			const parts = filePath.split('/')
			stack.pop()
			for (const part of parts) {
				if (part === '.') {
					continue
				} else if (part === '..') {
					stack.pop()
				} else {
					stack.push(part)
				}
			}
			return `url(${maybeQuote}${stack.join('/')}${maybeQuote})`
		},
	)
}

// eslint-disable-next-line no-control-regex
const SRCSET_NOT_SPACES = /^[^ \t\n\r\u000c]+/ // Don't use \s, to avoid matching non-breaking space
// eslint-disable-next-line no-control-regex
const SRCSET_COMMAS_OR_SPACES = /^[, \t\n\r\u000c]+/
function getAbsoluteSrcsetString(doc: Document, attributeValue: string) {
	/*
    run absoluteToDoc over every url in the srcset

    this is adapted from https://github.com/albell/parse-srcset/
    without the parsing of the descriptors (we return these as-is)
    parce-srcset is in turn based on
    https://html.spec.whatwg.org/multipage/embedded-content.html#parse-a-srcset-attribute
  */
	if (attributeValue.trim() === '') {
		return attributeValue
	}

	let pos = 0

	function collectCharacters(regEx: RegExp) {
		let chars: string
		const match = regEx.exec(attributeValue.substring(pos))
		if (match) {
			chars = match[0]
			pos += chars.length
			return chars
		}
		return ''
	}

	const output = []
	// eslint-disable-next-line no-constant-condition
	while (true) {
		collectCharacters(SRCSET_COMMAS_OR_SPACES)
		if (pos >= attributeValue.length) {
			break
		}
		// don't split on commas within urls
		let url = collectCharacters(SRCSET_NOT_SPACES)
		if (url.slice(-1) === ',') {
			// aside: according to spec more than one comma at the end is a parse error, but we ignore that
			url = absoluteToDoc(doc, url.substring(0, url.length - 1))
			// the trailing comma splits the srcset, so the interpretion is that
			// another url will follow, and the descriptor is empty
			output.push(url)
		} else {
			let descriptorsStr = ''
			url = absoluteToDoc(doc, url)
			let inParens = false
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const c = attributeValue.charAt(pos)
				if (c === '') {
					output.push((url + descriptorsStr).trim())
					break
				} else if (!inParens) {
					if (c === ',') {
						pos += 1
						output.push((url + descriptorsStr).trim())
						break // parse the next url
					} else if (c === '(') {
						inParens = true
					}
				} else {
					// in parenthesis; ignore commas
					// (parenthesis may be supported by future additions to spec)
					if (c === ')') {
						inParens = false
					}
				}
				descriptorsStr += c
				pos += 1
			}
		}
	}
	return output.join(', ')
}

export function absoluteToDoc(doc: Document, attributeValue: string): string {
	if (!attributeValue || attributeValue.trim() === '') {
		return attributeValue
	}
	const a: HTMLAnchorElement = doc.createElement('a')
	a.href = attributeValue
	return a.href
}

function isSVGElement(el: Element): boolean {
	return Boolean(el.tagName === 'svg' || (el as SVGElement).ownerSVGElement)
}

function getHref() {
	// return a href without hash
	const a = document.createElement('a')
	a.href = ''
	return a.href
}

export function transformAttribute(
	doc: Document,
	tagName: string,
	name: string,
	value: string,
): string {
	// relative path in attribute
	if (
		name === 'src' ||
		(name === 'href' && value && !(tagName === 'use' && value[0] === '#'))
	) {
		// href starts with a # is an id pointer for svg
		return absoluteToDoc(doc, value)
	} else if (name === 'xlink:href' && value && value[0] !== '#') {
		// xlink:href starts with # is an id pointer
		return absoluteToDoc(doc, value)
	} else if (
		name === 'background' &&
		value &&
		(tagName === 'table' || tagName === 'td' || tagName === 'th')
	) {
		return absoluteToDoc(doc, value)
	} else if (name === 'srcset' && value) {
		return getAbsoluteSrcsetString(doc, value)
	} else if (name === 'style' && value) {
		return absoluteToStylesheet(value, getHref())
	} else if (tagName === 'object' && name === 'data' && value) {
		return absoluteToDoc(doc, value)
	} else {
		return value
	}
}

export function _isBlockedElement(
	element: HTMLElement,
	blockClass: string | RegExp,
	blockSelector: string | null,
): boolean {
	if (typeof blockClass === 'string') {
		if (element.classList.contains(blockClass)) {
			return true
		}
	} else {
		for (let eIndex = element.classList.length; eIndex--; ) {
			const className = element.classList[eIndex]
			if (blockClass.test(className)) {
				return true
			}
		}
	}
	if (blockSelector) {
		return element.matches(blockSelector)
	}

	return false
}

export function classMatchesRegex(
	node: Node | null,
	regex: RegExp,
	checkAncestors: boolean,
): boolean {
	if (!node) return false
	if (node.nodeType !== node.ELEMENT_NODE) {
		if (!checkAncestors) return false
		return classMatchesRegex(node.parentNode, regex, checkAncestors)
	}

	for (let eIndex = (node as HTMLElement).classList.length; eIndex--; ) {
		const className = (node as HTMLElement).classList[eIndex]
		if (regex.test(className)) {
			return true
		}
	}
	if (!checkAncestors) return false
	return classMatchesRegex(node.parentNode, regex, checkAncestors)
}

export function needMaskingText(
	node: Node,
	maskTextClass: string | RegExp,
	maskTextSelector: string | null,
): boolean {
	const el: HTMLElement | null =
		node.nodeType === node.ELEMENT_NODE
			? (node as HTMLElement)
			: node.parentElement
	if (el === null) return false

	if (typeof maskTextClass === 'string') {
		if (el.classList.contains(maskTextClass)) return true
		if (el.closest(`.${maskTextClass}`)) return true
	} else {
		if (classMatchesRegex(el, maskTextClass, true)) return true
	}

	if (maskTextSelector) {
		if (el.matches(maskTextSelector)) return true
		if (el.closest(maskTextSelector)) return true
	}
	return false
}

// https://stackoverflow.com/a/36155560
function onceIframeLoaded(
	iframeEl: HTMLIFrameElement,
	listener: () => unknown,
	iframeLoadTimeout: number,
) {
	const win = iframeEl.contentWindow
	if (!win) {
		return
	}
	// document is loading
	let fired = false

	let readyState: DocumentReadyState
	try {
		readyState = win.document.readyState
	} catch (error) {
		return
	}
	if (readyState !== 'complete') {
		const timer = setTimeout(() => {
			if (!fired) {
				listener()
				fired = true
			}
		}, iframeLoadTimeout)
		iframeEl.addEventListener('load', () => {
			clearTimeout(timer)
			fired = true
			listener()
		})
		return
	}
	// check blank frame for Chrome
	const blankUrl = 'about:blank'
	if (
		win.location.href !== blankUrl ||
		iframeEl.src === blankUrl ||
		iframeEl.src === ''
	) {
		// iframe was already loaded, make sure we wait to trigger the listener
		// till _after_ the mutation that found this iframe has had time to process
		setTimeout(listener, 0)

		return iframeEl.addEventListener('load', listener) // keep listing for future loads
	}
	// use default listener
	iframeEl.addEventListener('load', listener)
}

function isStylesheetLoaded(link: HTMLLinkElement) {
	if (!link.getAttribute('href')) return true // nothing to load
	return link.sheet !== null
}

function onceStylesheetLoaded(
	link: HTMLLinkElement,
	listener: () => unknown,
	styleSheetLoadTimeout: number,
) {
	let fired = false
	let styleSheetLoaded: StyleSheet | null
	try {
		styleSheetLoaded = link.sheet
	} catch (error) {
		return
	}

	if (styleSheetLoaded) return

	const timer = setTimeout(() => {
		if (!fired) {
			listener()
			fired = true
		}
	}, styleSheetLoadTimeout)

	link.addEventListener('load', () => {
		clearTimeout(timer)
		fired = true
		listener()
	})
}

function serializeNode(
	n: Node,
	options: {
		doc: Document
		mirror: Mirror
		blockClass: string | RegExp
		blockSelector: string | null
		maskTextClass: string | RegExp
		maskTextSelector: string | null
		inlineStylesheet: boolean
		maskInputOptions: MaskInputOptions
		maskTextFn: MaskTextFn | undefined
		maskInputFn: MaskInputFn | undefined
		dataURLOptions?: DataURLOptions
		inlineImages: boolean
		recordCanvas: boolean
		keepIframeSrcFn: KeepIframeSrcFn
		/**
		 * `newlyAddedElement: true` skips scrollTop and scrollLeft check
		 */
		newlyAddedElement?: boolean
		/** Highlight Options Start */
		enableStrictPrivacy: boolean
		/** Highlight Options End */
	},
): serializedNode | false {
	const {
		doc,
		mirror,
		blockClass,
		blockSelector,
		maskTextClass,
		maskTextSelector,
		inlineStylesheet,
		maskInputOptions = {},
		maskTextFn,
		maskInputFn,
		dataURLOptions = {},
		inlineImages,
		recordCanvas,
		keepIframeSrcFn,
		newlyAddedElement = false,
		enableStrictPrivacy,
	} = options
	// Only record root id when document object is not the base document
	const rootId = getRootId(doc, mirror)
	switch (n.nodeType) {
		case n.DOCUMENT_NODE:
			if ((n as Document).compatMode !== 'CSS1Compat') {
				return {
					type: NodeType.Document,
					childNodes: [],
					compatMode: (n as Document).compatMode, // probably "BackCompat"
					rootId,
				}
			} else {
				return {
					type: NodeType.Document,
					childNodes: [],
					rootId,
				}
			}
		case n.DOCUMENT_TYPE_NODE:
			return {
				type: NodeType.DocumentType,
				name: (n as DocumentType).name,
				publicId: (n as DocumentType).publicId,
				systemId: (n as DocumentType).systemId,
				rootId,
			}
		case n.ELEMENT_NODE:
			return serializeElementNode(n as HTMLElement, {
				doc,
				blockClass,
				blockSelector,
				inlineStylesheet,
				maskInputOptions,
				maskInputFn,
				maskTextClass,
				dataURLOptions,
				inlineImages,
				recordCanvas,
				keepIframeSrcFn,
				newlyAddedElement,
				enableStrictPrivacy,
				rootId,
			})
		case n.TEXT_NODE:
			return serializeTextNode(n as Text, {
				maskTextClass,
				maskTextSelector,
				maskTextFn,
				enableStrictPrivacy,
				rootId,
			})
		case n.CDATA_SECTION_NODE:
			return {
				type: NodeType.CDATA,
				textContent: '',
				rootId,
			}
		case n.COMMENT_NODE:
			return {
				type: NodeType.Comment,
				textContent: (n as Comment).textContent || '',
				rootId,
			}
		default:
			return false
	}
}

function getRootId(doc: Document, mirror: Mirror): number | undefined {
	if (!mirror.hasNode(doc)) return undefined
	const docId = mirror.getId(doc)
	return docId === 1 ? undefined : docId
}

function serializeTextNode(
	n: Text,
	options: {
		maskTextClass: string | RegExp
		maskTextSelector: string | null
		maskTextFn: MaskTextFn | undefined
		enableStrictPrivacy: boolean
		rootId: number | undefined
	},
): serializedNode {
	const {
		maskTextClass,
		maskTextSelector,
		maskTextFn,
		enableStrictPrivacy,
		rootId,
	} = options
	// The parent node may not be a html element which has a tagName attribute.
	// So just let it be undefined which is ok in this use case.
	const parentTagName = n.parentNode && (n.parentNode as HTMLElement).tagName
	let textContent = n.textContent
	const isStyle = parentTagName === 'STYLE' ? true : undefined
	const isScript = parentTagName === 'SCRIPT' ? true : undefined
	/** Determines if this node has been handled already. */
	let textContentHandled = false
	if (isStyle && textContent) {
		try {
			// try to read style sheet
			if (n.nextSibling || n.previousSibling) {
				// This is not the only child of the stylesheet.
				// We can't read all of the sheet's .cssRules and expect them
				// to _only_ include the current rule(s) added by the text node.
				// So we'll be conservative and keep textContent as-is.
			} else if ((n.parentNode as HTMLStyleElement).sheet?.cssRules) {
				textContent = stringifyStyleSheet(
					(n.parentNode as HTMLStyleElement).sheet!,
				)
			}
		} catch (err) {
			console.warn(
				`Cannot get CSS styles from text's parentNode. Error: ${
					err as string
				}`,
				n,
			)
		}
		textContent = absoluteToStylesheet(textContent, getHref())
		textContentHandled = true
	}
	if (isScript) {
		textContent = 'SCRIPT_PLACEHOLDER'
		textContentHandled = true
	} else if (parentTagName === 'NOSCRIPT') {
		textContent = ''
		textContentHandled = true
	}
	if (
		!isStyle &&
		!isScript &&
		textContent &&
		needMaskingText(n, maskTextClass, maskTextSelector)
	) {
		textContent = maskTextFn
			? maskTextFn(textContent)
			: textContent.replace(/[\S]/g, '*')
	}

	/* Start of Highlight */
	// Randomizes the text content to a string of the same length.
	if (enableStrictPrivacy && !textContentHandled && parentTagName) {
		const IGNORE_TAG_NAMES = new Set([
			'HEAD',
			'TITLE',
			'STYLE',
			'SCRIPT',
			'HTML',
			'BODY',
			'NOSCRIPT',
		])
		if (!IGNORE_TAG_NAMES.has(parentTagName) && textContent) {
			textContent = obfuscateText(textContent)
		}
	}
	/* End of Highlight */

	return {
		type: NodeType.Text,
		textContent: textContent || '',
		isStyle,
		rootId,
	}
}

function serializeElementNode(
	n: HTMLElement,
	options: {
		doc: Document
		blockClass: string | RegExp
		blockSelector: string | null
		inlineStylesheet: boolean
		maskInputOptions: MaskInputOptions
		maskInputFn: MaskInputFn | undefined
		maskTextClass: string | RegExp
		dataURLOptions?: DataURLOptions
		inlineImages: boolean
		recordCanvas: boolean
		keepIframeSrcFn: KeepIframeSrcFn
		/**
		 * `newlyAddedElement: true` skips scrollTop and scrollLeft check
		 */
		newlyAddedElement?: boolean
		enableStrictPrivacy: boolean
		rootId: number | undefined
	},
): serializedNode | false {
	const {
		doc,
		blockClass,
		blockSelector,
		inlineStylesheet,
		maskInputOptions = {},
		maskInputFn,
		maskTextClass,
		dataURLOptions = {},
		inlineImages,
		recordCanvas,
		keepIframeSrcFn,
		newlyAddedElement = false,
		enableStrictPrivacy,
		rootId,
	} = options
	let needBlock = _isBlockedElement(n, blockClass, blockSelector)
	const needMask = _isBlockedElement(n, maskTextClass, null)
	const tagName = getValidTagName(n)
	let attributes: attributes = {}
	const len = n.attributes.length
	for (let i = 0; i < len; i++) {
		const attr = n.attributes[i]
		attributes[attr.name] = transformAttribute(
			doc,
			tagName,
			attr.name,
			attr.value,
		)
	}
	// remote css
	if (tagName === 'link' && inlineStylesheet) {
		const stylesheet = Array.from(doc.styleSheets).find((s) => {
			return s.href === (n as HTMLLinkElement).href
		})
		let cssText: string | null = null
		if (stylesheet) {
			cssText = getCssRulesString(stylesheet)
		}
		if (cssText) {
			delete attributes.rel
			delete attributes.href
			attributes._cssText = absoluteToStylesheet(
				cssText,
				stylesheet!.href!,
			)
		}
	}
	// dynamic stylesheet
	if (
		tagName === 'style' &&
		(n as HTMLStyleElement).sheet &&
		// TODO: Currently we only try to get dynamic stylesheet when it is an empty style element
		!(n.innerText || n.textContent || '').trim().length
	) {
		const cssText = getCssRulesString(
			(n as HTMLStyleElement).sheet as CSSStyleSheet,
		)
		if (cssText) {
			attributes._cssText = absoluteToStylesheet(cssText, getHref())
		}
	}
	// form fields
	if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
		const value = (n as HTMLInputElement | HTMLTextAreaElement).value
		if (
			attributes.type !== 'radio' &&
			attributes.type !== 'checkbox' &&
			attributes.type !== 'submit' &&
			attributes.type !== 'button' &&
			value
		) {
			attributes.value = maskInputValue({
				type: attributes.type,
				tagName,
				value,
				maskInputOptions,
				maskInputFn,
			})
		} else if ((n as HTMLInputElement).checked) {
			attributes.checked = (n as HTMLInputElement).checked
		}
	}
	if (tagName === 'option') {
		if ((n as HTMLOptionElement).selected && !maskInputOptions['select']) {
			attributes.selected = true
		} else {
			// ignore the html attribute (which corresponds to DOM (n as HTMLOptionElement).defaultSelected)
			// if it's already been changed
			delete attributes.selected
		}
	}
	// canvas image data
	if (tagName === 'canvas' && recordCanvas) {
		if ((n as ICanvas).__context === '2d') {
			// only record this on 2d canvas
			if (!is2DCanvasBlank(n as HTMLCanvasElement)) {
				attributes.rr_dataURL = (n as HTMLCanvasElement).toDataURL(
					dataURLOptions.type,
					dataURLOptions.quality,
				)
			}
		} else if (!('__context' in n)) {
			// context is unknown, better not call getContext to trigger it
			const canvasDataURL = (n as HTMLCanvasElement).toDataURL(
				dataURLOptions.type,
				dataURLOptions.quality,
			)

			// create blank canvas of same dimensions
			const blankCanvas = document.createElement('canvas')
			blankCanvas.width = (n as HTMLCanvasElement).width
			blankCanvas.height = (n as HTMLCanvasElement).height
			const blankCanvasDataURL = blankCanvas.toDataURL(
				dataURLOptions.type,
				dataURLOptions.quality,
			)

			// no need to save dataURL if it's the same as blank canvas
			if (canvasDataURL !== blankCanvasDataURL) {
				attributes.rr_dataURL = canvasDataURL
			}
		}
	}
	// save image offline
	if (
		tagName === 'img' &&
		inlineImages &&
		!needBlock &&
		!needMask &&
		!enableStrictPrivacy
	) {
		if (!canvasService) {
			canvasService = doc.createElement('canvas')
			canvasCtx = canvasService.getContext('2d')
		}
		const image = n as HTMLImageElement
		const oldValue = image.crossOrigin
		image.crossOrigin = 'anonymous'
		const recordInlineImage = () => {
			try {
				canvasService!.width = image.naturalWidth
				canvasService!.height = image.naturalHeight
				canvasCtx!.drawImage(image, 0, 0)
				attributes.rr_dataURL = canvasService!.toDataURL(
					dataURLOptions.type,
					dataURLOptions.quality,
				)
			} catch (err) {
				console.warn(
					`Cannot inline img src=${image.currentSrc}! Error: ${
						err as string
					}`,
				)
			}
			oldValue
				? (attributes.crossOrigin = oldValue)
				: image.removeAttribute('crossorigin')
		}
		// The image content may not have finished loading yet.
		if (image.complete && image.naturalWidth !== 0) recordInlineImage()
		else image.onload = recordInlineImage
	}
	// media elements
	if (tagName === 'audio' || tagName === 'video') {
		attributes.rr_mediaState = (n as HTMLMediaElement).paused
			? 'paused'
			: 'played'
		attributes.rr_mediaCurrentTime = (n as HTMLMediaElement).currentTime
	}
	// Scroll
	if (!newlyAddedElement) {
		// `scrollTop` and `scrollLeft` are expensive calls because they trigger reflow.
		// Since `scrollTop` & `scrollLeft` are always 0 when an element is added to the DOM.
		// And scrolls also get picked up by rrweb's ScrollObserver
		// So we can safely skip the `scrollTop/Left` calls for newly added elements
		if (n.scrollLeft) {
			attributes.rr_scrollLeft = n.scrollLeft
		}
		if (n.scrollTop) {
			attributes.rr_scrollTop = n.scrollTop
		}
	}
	// block element
	if (needBlock || needMask || (tagName === 'img' && enableStrictPrivacy)) {
		const { width, height } = n.getBoundingClientRect()
		attributes = {
			class: attributes.class,
			rr_width: `${width}px`,
			rr_height: `${height}px`,
		}
		if (enableStrictPrivacy) {
			needBlock = true
		}
	}
	// iframe
	if (tagName === 'iframe' && !keepIframeSrcFn(attributes.src as string)) {
		if (!(n as HTMLIFrameElement).contentDocument) {
			// we can't record it directly as we can't see into it
			// preserve the src attribute so a decision can be taken at replay time
			attributes.rr_src = attributes.src
		}
		delete attributes.src // prevent auto loading
	}

	return {
		type: NodeType.Element,
		tagName,
		attributes,
		childNodes: [],
		isSVG: isSVGElement(n as Element) || undefined,
		needBlock,
		needMask,
		rootId,
	}
}

function lowerIfExists(maybeAttr: string | number | boolean): string {
	if (maybeAttr === undefined) {
		return ''
	} else {
		return (maybeAttr as string).toLowerCase()
	}
}

function slimDOMExcluded(
	sn: serializedNode,
	slimDOMOptions: SlimDOMOptions,
): boolean {
	if (slimDOMOptions.comment && sn.type === NodeType.Comment) {
		// TODO: convert IE conditional comments to real nodes
		return true
	} else if (sn.type === NodeType.Element) {
		if (
			slimDOMOptions.script &&
			// script tag
			(sn.tagName === 'script' ||
				// preload link
				(sn.tagName === 'link' &&
					sn.attributes.rel === 'preload' &&
					sn.attributes.as === 'script') ||
				// prefetch link
				(sn.tagName === 'link' &&
					sn.attributes.rel === 'prefetch' &&
					typeof sn.attributes.href === 'string' &&
					sn.attributes.href.endsWith('.js')))
		) {
			return true
		} else if (
			slimDOMOptions.headFavicon &&
			((sn.tagName === 'link' && sn.attributes.rel === 'shortcut icon') ||
				(sn.tagName === 'meta' &&
					(lowerIfExists(sn.attributes.name).match(
						/^msapplication-tile(image|color)$/,
					) ||
						lowerIfExists(sn.attributes.name) ===
							'application-name' ||
						lowerIfExists(sn.attributes.rel) === 'icon' ||
						lowerIfExists(sn.attributes.rel) ===
							'apple-touch-icon' ||
						lowerIfExists(sn.attributes.rel) === 'shortcut icon')))
		) {
			return true
		} else if (sn.tagName === 'meta') {
			if (
				slimDOMOptions.headMetaDescKeywords &&
				lowerIfExists(sn.attributes.name).match(
					/^description|keywords$/,
				)
			) {
				return true
			} else if (
				slimDOMOptions.headMetaSocial &&
				(lowerIfExists(sn.attributes.property).match(
					/^(og|twitter|fb):/,
				) || // og = opengraph (facebook)
					lowerIfExists(sn.attributes.name).match(/^(og|twitter):/) ||
					lowerIfExists(sn.attributes.name) === 'pinterest')
			) {
				return true
			} else if (
				slimDOMOptions.headMetaRobots &&
				(lowerIfExists(sn.attributes.name) === 'robots' ||
					lowerIfExists(sn.attributes.name) === 'googlebot' ||
					lowerIfExists(sn.attributes.name) === 'bingbot')
			) {
				return true
			} else if (
				slimDOMOptions.headMetaHttpEquiv &&
				sn.attributes['http-equiv'] !== undefined
			) {
				// e.g. X-UA-Compatible, Content-Type, Content-Language,
				// cache-control, X-Translated-By
				return true
			} else if (
				slimDOMOptions.headMetaAuthorship &&
				(lowerIfExists(sn.attributes.name) === 'author' ||
					lowerIfExists(sn.attributes.name) === 'generator' ||
					lowerIfExists(sn.attributes.name) === 'framework' ||
					lowerIfExists(sn.attributes.name) === 'publisher' ||
					lowerIfExists(sn.attributes.name) === 'progid' ||
					lowerIfExists(sn.attributes.property).match(/^article:/) ||
					lowerIfExists(sn.attributes.property).match(/^product:/))
			) {
				return true
			} else if (
				slimDOMOptions.headMetaVerification &&
				(lowerIfExists(sn.attributes.name) ===
					'google-site-verification' ||
					lowerIfExists(sn.attributes.name) ===
						'yandex-verification' ||
					lowerIfExists(sn.attributes.name) === 'csrf-token' ||
					lowerIfExists(sn.attributes.name) === 'p:domain_verify' ||
					lowerIfExists(sn.attributes.name) === 'verify-v1' ||
					lowerIfExists(sn.attributes.name) === 'verification' ||
					lowerIfExists(sn.attributes.name) ===
						'shopify-checkout-api-token')
			) {
				return true
			}
		}
	}
	return false
}

export function serializeNodeWithId(
	n: Node,
	options: {
		doc: Document
		mirror: Mirror
		blockClass: string | RegExp
		blockSelector: string | null
		maskTextClass: string | RegExp
		maskTextSelector: string | null
		skipChild: boolean
		inlineStylesheet: boolean
		newlyAddedElement?: boolean
		maskInputOptions?: MaskInputOptions
		maskTextFn: MaskTextFn | undefined
		maskInputFn: MaskInputFn | undefined
		slimDOMOptions: SlimDOMOptions
		dataURLOptions?: DataURLOptions
		keepIframeSrcFn?: KeepIframeSrcFn
		inlineImages?: boolean
		recordCanvas?: boolean
		preserveWhiteSpace?: boolean
		onSerialize?: (n: Node) => unknown
		onIframeLoad?: (
			iframeNode: HTMLIFrameElement,
			node: serializedElementNodeWithId,
		) => unknown
		iframeLoadTimeout?: number
		enableStrictPrivacy: boolean
		onStylesheetLoad?: (
			linkNode: HTMLLinkElement,
			node: serializedElementNodeWithId,
		) => unknown
		stylesheetLoadTimeout?: number
	},
): serializedNodeWithId | null {
	const {
		doc,
		mirror,
		blockClass,
		blockSelector,
		maskTextClass,
		maskTextSelector,
		skipChild = false,
		inlineStylesheet = true,
		maskInputOptions = {},
		maskTextFn,
		maskInputFn,
		slimDOMOptions,
		dataURLOptions = {},
		inlineImages = false,
		recordCanvas = false,
		onSerialize,
		onIframeLoad,
		iframeLoadTimeout = 5000,
		onStylesheetLoad,
		stylesheetLoadTimeout = 5000,
		keepIframeSrcFn = () => false,
		newlyAddedElement = false,
		enableStrictPrivacy,
	} = options
	let { preserveWhiteSpace = true } = options
	const _serializedNode = serializeNode(n, {
		doc,
		mirror,
		blockClass,
		blockSelector,
		maskTextClass,
		maskTextSelector,
		inlineStylesheet,
		maskInputOptions,
		maskTextFn,
		maskInputFn,
		dataURLOptions,
		inlineImages,
		recordCanvas,
		keepIframeSrcFn,
		newlyAddedElement,
		enableStrictPrivacy,
	})
	if (!_serializedNode) {
		// TODO: dev only
		console.warn(n, 'not serialized')
		return null
	}

	let id: number | undefined
	if (mirror.hasNode(n)) {
		// Reuse the previous id
		id = mirror.getId(n)
	} else if (
		slimDOMExcluded(_serializedNode, slimDOMOptions) ||
		(!preserveWhiteSpace &&
			_serializedNode.type === NodeType.Text &&
			!_serializedNode.isStyle &&
			!_serializedNode.textContent.replace(/^\s+|\s+$/gm, '').length)
	) {
		id = IGNORED_NODE
	} else {
		id = genId()
	}
	if (id === IGNORED_NODE) {
		return null // slimDOM
	}

	const serializedNode = Object.assign(_serializedNode, { id })

	mirror.add(n, serializedNode)

	if (onSerialize) {
		onSerialize(n)
	}
	let recordChild = !skipChild
	let strictPrivacy = enableStrictPrivacy
	if (serializedNode.type === NodeType.Element) {
		recordChild = recordChild && !serializedNode.needBlock
		strictPrivacy =
			enableStrictPrivacy ||
			!!serializedNode.needBlock ||
			!!serializedNode.needMask

		/** Highlight Code Begin */
		// Remove the image's src if enableStrictPrivacy.
		if (strictPrivacy && serializedNode.tagName === 'img') {
			const clone = n.cloneNode()
			;(clone as unknown as HTMLImageElement).src = ''
			mirror.add(clone, serializedNode)
		}
		/** Highlight Code End */

		// these properties was not needed in replay side
		delete serializedNode.needBlock
		delete serializedNode.needMask
		const shadowRoot = (n as HTMLElement).shadowRoot
		if (shadowRoot && isNativeShadowDom(shadowRoot))
			serializedNode.isShadowHost = true
	}
	if (
		(serializedNode.type === NodeType.Document ||
			serializedNode.type === NodeType.Element) &&
		recordChild
	) {
		if (
			slimDOMOptions.headWhitespace &&
			serializedNode.type === NodeType.Element &&
			serializedNode.tagName === 'head'
			// would impede performance: || getComputedStyle(n)['white-space'] === 'normal'
		) {
			preserveWhiteSpace = false
		}
		const bypassOptions = {
			doc,
			mirror,
			blockClass,
			blockSelector,
			maskTextClass,
			maskTextSelector,
			skipChild,
			inlineStylesheet,
			maskInputOptions,
			maskTextFn,
			maskInputFn,
			slimDOMOptions,
			dataURLOptions,
			inlineImages,
			recordCanvas,
			preserveWhiteSpace,
			onSerialize,
			onIframeLoad,
			iframeLoadTimeout,
			onStylesheetLoad,
			stylesheetLoadTimeout,
			keepIframeSrcFn,
			enableStrictPrivacy: strictPrivacy,
		}
		for (const childN of Array.from(n.childNodes)) {
			const serializedChildNode = serializeNodeWithId(
				childN,
				bypassOptions,
			)
			if (serializedChildNode) {
				serializedNode.childNodes.push(serializedChildNode)
			}
		}

		if (isElement(n) && n.shadowRoot) {
			for (const childN of Array.from(n.shadowRoot.childNodes)) {
				const serializedChildNode = serializeNodeWithId(
					childN,
					bypassOptions,
				)
				if (serializedChildNode) {
					isNativeShadowDom(n.shadowRoot) &&
						(serializedChildNode.isShadow = true)
					serializedNode.childNodes.push(serializedChildNode)
				}
			}
		}
	}

	if (
		n.parentNode &&
		isShadowRoot(n.parentNode) &&
		isNativeShadowDom(n.parentNode)
	) {
		serializedNode.isShadow = true
	}

	if (
		serializedNode.type === NodeType.Element &&
		serializedNode.tagName === 'iframe'
	) {
		onceIframeLoaded(
			n as HTMLIFrameElement,
			() => {
				const iframeDoc = (n as HTMLIFrameElement).contentDocument
				if (iframeDoc && onIframeLoad) {
					const serializedIframeNode = serializeNodeWithId(
						iframeDoc,
						{
							doc: iframeDoc,
							mirror,
							blockClass,
							blockSelector,
							maskTextClass,
							maskTextSelector,
							skipChild: false,
							inlineStylesheet,
							maskInputOptions,
							maskTextFn,
							maskInputFn,
							slimDOMOptions,
							dataURLOptions,
							inlineImages,
							recordCanvas,
							preserveWhiteSpace,
							onSerialize,
							onIframeLoad,
							iframeLoadTimeout,
							onStylesheetLoad,
							stylesheetLoadTimeout,
							keepIframeSrcFn,
							enableStrictPrivacy,
						},
					)

					if (serializedIframeNode) {
						onIframeLoad(
							n as HTMLIFrameElement,
							serializedIframeNode as serializedElementNodeWithId,
						)
					}
				}
			},
			iframeLoadTimeout,
		)
	}

	// <link rel=stylesheet href=...>
	if (
		serializedNode.type === NodeType.Element &&
		serializedNode.tagName === 'link' &&
		serializedNode.attributes.rel === 'stylesheet'
	) {
		onceStylesheetLoaded(
			n as HTMLLinkElement,
			() => {
				if (onStylesheetLoad) {
					const serializedLinkNode = serializeNodeWithId(n, {
						doc,
						mirror,
						blockClass,
						blockSelector,
						maskTextClass,
						maskTextSelector,
						skipChild: false,
						inlineStylesheet,
						maskInputOptions,
						maskTextFn,
						maskInputFn,
						slimDOMOptions,
						dataURLOptions,
						inlineImages,
						recordCanvas,
						preserveWhiteSpace,
						onSerialize,
						onIframeLoad,
						iframeLoadTimeout,
						onStylesheetLoad,
						stylesheetLoadTimeout,
						keepIframeSrcFn,
						enableStrictPrivacy,
					})

					if (serializedLinkNode) {
						onStylesheetLoad(
							n as HTMLLinkElement,
							serializedLinkNode as serializedElementNodeWithId,
						)
					}
				}
			},
			stylesheetLoadTimeout,
		)
		if (isStylesheetLoaded(n as HTMLLinkElement) === false) return null // add stylesheet in later mutation
	}

	// <link rel=stylesheet href=...>
	if (
		serializedNode.type === NodeType.Element &&
		serializedNode.tagName === 'link' &&
		serializedNode.attributes.rel === 'stylesheet'
	) {
		onceStylesheetLoaded(
			n as HTMLLinkElement,
			() => {
				if (onStylesheetLoad) {
					const serializedLinkNode = serializeNodeWithId(n, {
						doc,
						mirror,
						blockClass,
						blockSelector,
						maskTextClass,
						maskTextSelector,
						skipChild: false,
						inlineStylesheet,
						maskInputOptions,
						maskTextFn,
						maskInputFn,
						slimDOMOptions,
						dataURLOptions,
						inlineImages,
						recordCanvas,
						preserveWhiteSpace,
						onSerialize,
						onIframeLoad,
						iframeLoadTimeout,
						enableStrictPrivacy,
						onStylesheetLoad,
						stylesheetLoadTimeout,
						keepIframeSrcFn,
					})

					if (serializedLinkNode) {
						onStylesheetLoad(
							n as HTMLLinkElement,
							serializedLinkNode as serializedElementNodeWithId,
						)
					}
				}
			},
			stylesheetLoadTimeout,
		)
		if (isStylesheetLoaded(n as HTMLLinkElement) === false) return null // add stylesheet in later mutation
	}

	return serializedNode
}

function snapshot(
	n: Document,
	options?: {
		mirror?: Mirror
		blockClass?: string | RegExp
		blockSelector?: string | null
		maskTextClass?: string | RegExp
		maskTextSelector?: string | null
		inlineStylesheet?: boolean
		maskAllInputs?: boolean | MaskInputOptions
		maskTextFn?: MaskTextFn
		maskInputFn?: MaskTextFn
		slimDOM?: boolean | SlimDOMOptions
		dataURLOptions?: DataURLOptions
		inlineImages?: boolean
		recordCanvas?: boolean
		preserveWhiteSpace?: boolean
		onSerialize?: (n: Node) => unknown
		onIframeLoad?: (
			iframeNode: HTMLIFrameElement,
			node: serializedElementNodeWithId,
		) => unknown
		iframeLoadTimeout?: number
		onStylesheetLoad?: (
			linkNode: HTMLLinkElement,
			node: serializedElementNodeWithId,
		) => unknown
		stylesheetLoadTimeout?: number
		keepIframeSrcFn?: KeepIframeSrcFn
		enableStrictPrivacy: boolean
	},
): serializedNodeWithId | null {
	const {
		mirror = new Mirror(),
		blockClass = 'highlight-block',
		blockSelector = null,
		maskTextClass = 'highlight-mask',
		maskTextSelector = null,
		inlineStylesheet = true,
		inlineImages = false,
		recordCanvas = false,
		maskAllInputs = false,
		maskTextFn,
		maskInputFn,
		slimDOM = false,
		dataURLOptions,
		preserveWhiteSpace,
		onSerialize,
		onIframeLoad,
		iframeLoadTimeout,
		onStylesheetLoad,
		stylesheetLoadTimeout,
		keepIframeSrcFn = () => false,
		enableStrictPrivacy = false,
	} = options || {}
	const maskInputOptions: MaskInputOptions =
		maskAllInputs === true
			? {
					color: true,
					date: true,
					'datetime-local': true,
					email: true,
					month: true,
					number: true,
					range: true,
					search: true,
					tel: true,
					text: true,
					time: true,
					url: true,
					week: true,
					textarea: true,
					select: true,
					password: true,
			  }
			: maskAllInputs === false
			? {
					password: true,
			  }
			: maskAllInputs
	const slimDOMOptions: SlimDOMOptions =
		slimDOM === true || slimDOM === 'all'
			? // if true: set of sensible options that should not throw away any information
			  {
					script: true,
					comment: true,
					headFavicon: true,
					headWhitespace: true,
					headMetaDescKeywords: slimDOM === 'all', // destructive
					headMetaSocial: true,
					headMetaRobots: true,
					headMetaHttpEquiv: true,
					headMetaAuthorship: true,
					headMetaVerification: true,
			  }
			: slimDOM === false
			? {}
			: slimDOM
	return serializeNodeWithId(n, {
		doc: n,
		mirror,
		blockClass,
		blockSelector,
		maskTextClass,
		maskTextSelector,
		skipChild: false,
		inlineStylesheet,
		maskInputOptions,
		maskTextFn,
		maskInputFn,
		slimDOMOptions,
		dataURLOptions,
		inlineImages,
		recordCanvas,
		preserveWhiteSpace,
		onSerialize,
		onIframeLoad,
		iframeLoadTimeout,
		onStylesheetLoad,
		stylesheetLoadTimeout,
		keepIframeSrcFn,
		newlyAddedElement: false,
		enableStrictPrivacy,
	})
}

export function visitSnapshot(
	node: serializedNodeWithId,
	onVisit: (node: serializedNodeWithId) => unknown,
) {
	function walk(current: serializedNodeWithId) {
		onVisit(current)
		if (
			current.type === NodeType.Document ||
			current.type === NodeType.Element
		) {
			current.childNodes.forEach(walk)
		}
	}

	walk(node)
}

export function cleanupSnapshot() {
	// allow a new recording to start numbering nodes from scratch
	_id = 1
}

export default snapshot