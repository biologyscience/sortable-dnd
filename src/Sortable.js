import {
  css,
  matches,
  getRect,
  throttle,
  debounce,
  getOffset,
  _nextTick,
  getElement,
  toggleClass,
  getParentAutoScrollElement
} from './utils.js'
import { IOS, Edge, Safari, IE11OrLess, ChromeForAndroid } from './Brower.js'
import { Ghost, Differ, State } from './Plugins.js'
import Animation from './Animation.js'
import Events from './events.js'

// -------------------------------- Sortable ----------------------------------
const documentExists = typeof document !== 'undefined'
const supportDraggable = documentExists && !ChromeForAndroid && !IOS && ('draggable' in document.createElement('div'))

/**
 * @class  Sortable
 * @param  {HTMLElement}  el group element
 * @param  {Object}       options
 */
function Sortable(el, options) {
  if (!(el && el.nodeType && el.nodeType === 1)) {
		throw `Sortable: \`el\` must be an HTMLElement, not ${ {}.toString.call(el) }`;
	}

  this.rootEl = el // root element
  this.scrollEl = getParentAutoScrollElement(el, true) // scroll element
  this.options = options = Object.assign({}, options)
  this.ownerDocument = el.ownerDocument

  const defaults = {
    autoScroll: true, // 拖拽到容器边缘时自动滚动
    scrollStep: 5, // 每一帧滚动的距离
    scrollThreshold: 15, // 自动滚动的阈值
    
    delay: 0, // 定义鼠标选中列表单元可以开始拖动的延迟时间
    delayOnTouchOnly: false, // only delay if user is using touch
    disabled: false, // 定义是否此sortable对象是否可用，为true时sortable对象不能拖放排序等功能，为false时为可以进行排序，相当于一个开关
    animation: 150, // 定义排序动画的时间

    ghostAnimation: 0, // 拖拽元素销毁时动画效果
    ghostClass: '', // 拖拽元素Class类名
    ghostStyle: {}, // 拖拽元素样式
    chosenClass: '', // 选中元素样式
    
    draggable: undefined, // String: css选择器, Function: (e) => return true
    dragging: undefined, // 设置拖拽元素，必须为函数且必须返回一个 HTMLElement: (e) => return e.target
    onDrag: undefined, // 拖拽开始时触发的回调函数: () => {}
    onMove: undefined, // 拖拽过程中的回调函数: (from, to) => {}
    onDrop: undefined, // 拖拽完成时的回调函数: (from, to, changed) => {}
    onChange: undefined, // 拖拽元素改变位置的时候: (from, to) => {}

    fallbackOnBody: false,
    forceFallback: false, // 忽略 HTML5拖拽行为，强制回调进行
    stopPropagation: false, // 阻止捕获和冒泡阶段中当前事件的进一步传播

    supportPointer: ('PointerEvent' in window) && !Safari,
    supportTouch: 'ontouchstart' in window,
  }

  // Set default options
  for (const name in defaults) {
    !(name in this.options) && (this.options[name] = defaults[name])
  }

  this.container = this.options.fallbackOnBody ? document.body : this.rootEl
  this.nativeDraggable = this.options.forceFallback ? false : supportDraggable

  this.move = { x: 0, y: 0 }
  this.state = new State // 拖拽过程中状态记录
  this.differ = new Differ() // 记录拖拽前后差异
  this.ghost = new Ghost(this) // 拖拽时蒙版元素
  this.dragEl = null // 拖拽元素
  this.dropEl = null // 释放元素
  this.dragStartTimer = null // setTimeout timer
  this.autoScrollTimer = null

  Object.assign(this, Animation(), Events())

  this._onStart = this._onStart.bind(this)
  this._onMove = this._onMove.bind(this)
  this._onDrop = this._onDrop.bind(this)
  this._bindEventListener()

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function(callback) {
      return setTimeout(callback, 17)
    }
  }
}

Sortable.prototype = {
  constructor: Sortable,

  /**
   * Destroy
   */
  destroy: function() {
    this._unbindEventListener()
    this._clearState()
  },

  /**
   * set value for options by key
   */
  set (key, value) {
    this.options[key] = value
  },

  /**
   * get value from options by key
   */
  get (key) {
    return this.options[key]
  },

  // -------------------------------- prepare start ----------------------------------
  _onStart: function(/** Event|TouchEvent */evt) {
    if (/mousedown|pointerdown/.test(evt.type) && evt.button !== 0 || this.options.disabled) return // only left button and enabled

    const touch = (evt.touches && evt.touches[0]) || (evt.pointerType && evt.pointerType === 'touch' && evt)
    const e = touch || evt

    // Safari ignores further event handling after mousedown
		if (!this.nativeDraggable && Safari && e.target && e.target.tagName.toUpperCase() === 'SELECT') return
    if (e.target === this.rootEl) return true

    if (this.options.stopPropagation) evt.stopPropagation()

    const { delay, delayOnTouchOnly } = this.options
    if (delay && (!delayOnTouchOnly || touch) && (!this.nativeDraggable || !(Edge || IE11OrLess))) {
      clearTimeout(this.dragStartTimer)
      // delay to start
      this.dragStartTimer = setTimeout(() => this._onDrag(e, touch), delay)
    } else {
      this._onDrag(e, touch)
    }
  },
  _onDrag: function(/** Event|TouchEvent */e, touch) {
    const { draggable, dragging } = this.options

    if (typeof draggable === 'function') {
      if (!draggable(e)) return true

    } else if (typeof draggable === 'string') {
      if (!matches(e.target, draggable)) return true

    } else if (draggable !== undefined) {
      throw new Error(`draggable expected "function" or "string" but received "${typeof draggable}"`)
    }

    this._removeSelection()

    // 获取拖拽元素                 
    if (dragging) {
      if (typeof dragging === 'function') this.dragEl = dragging(e)
      else throw new Error(`dragging expected "function" or "string" but received "${typeof dragging}"`)
    } else {
      this.dragEl = getElement(this.rootEl, e.target, true)
    }

    // 不存在拖拽元素时不允许拖拽
    if (!this.dragEl || this.dragEl.animated) return true

    // 获取拖拽元素在列表中的位置
    const { rect, offset } = getElement(this.rootEl, this.dragEl)
    this.move = { x: e.clientX, y: e.clientY }
    this.differ.from = { node: this.dragEl, rect, offset}
    this.ghost.distance = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    this.state.sortableDown = e // sortable state down is active

    this._bindMoveEvents(touch)
    this._bindUpEvents(touch)
  },
  
  // -------------------------------- is started ----------------------------------
  _onStarted: function(e, /** originalEvent */evt) {
    if (!this.ghost.$el) {
      // 将初始化放到move事件中，防止与click事件冲突
      const { rect } = this.differ.from
      this.ghost.init(this.dragEl.cloneNode(true), rect)

      // add class for drag element
      toggleClass(this.dragEl, this.options.chosenClass, true)
      // 解决移动端无法拖拽问题
      this.dragEl.style['touch-action'] = 'none'
      this.dragEl.style['will-change'] = 'transform'

      // onDrag callback
      const { onDrag } = this.options
      if (onDrag && typeof onDrag === 'function') onDrag(this.dragEl, e, evt)

      if (Safari) css(document.body, 'user-select', 'none')
    }
  },

  // -------------------------------- on move ----------------------------------
  _onMove: function(/** Event|TouchEvent */evt) {
    if (!this.state.sortableDown) return
    const touch = (evt.touches && evt.touches[0]) || (evt.pointerType && evt.pointerType === 'touch' && evt)
    const e = touch || evt
    const { clientX, clientY } = e
    const target = touch ? document.elementFromPoint(clientX, clientY) : e.target
    const distanceX = clientX - this.move.x
    const distanceY = clientY - this.move.y

    if ((clientX !== void 0 && Math.abs(distanceX) <= 0) && (clientY !== void 0 && Math.abs(distanceY) <= 0)) {
      return
    }

    this.state.sortableMove = e // sortable state move is active

    const { stopPropagation } = this.options
    stopPropagation && evt.stopPropagation && evt.stopPropagation() // 阻止事件冒泡
    evt.preventDefault !== void 0 && evt.cancelable && evt.preventDefault() // prevent scrolling

    this._onStarted(e, evt)
    this.ghost.move(distanceX, distanceY)

    // 拖拽过程中触发的回调
    const { onMove } = this.options
    if (onMove && typeof onMove === 'function') onMove(this.differ.from, this.ghost.$el, e, evt)

    // 判断边界值
    if (clientX < 0 || clientY < 0) return
    const { top, right, bottom, left } = getRect(this.rootEl)
    if (clientX < left || clientX > right || clientY < top || clientY > bottom) return

    // check if element will exchange
    this._onChange(this, target, e, evt)
    // auto scroll
    this.autoScrollTimer && clearTimeout(this.autoScrollTimer)
    if (this.options.autoScroll) {
      this.autoScrollTimer = setTimeout(() => this._autoScroll(this), 0)
    }
  },
  _onChange: debounce(function(_this, target, e, evt) {
    const { el, rect, offset } = getElement(_this.rootEl, target)
    if (!el || (el && el.animated)) return
    
    _this.dropEl = el
    const { clientX, clientY } = e
    const { left, right, top, bottom } = rect

    if (clientX > left && clientX < right && clientY > top && clientY < bottom) {
      // 拖拽前后元素不一致时交换
      if (el !== _this.dragEl) {
        _this.differ.to = { node: _this.dropEl, rect, offset }

        _this.captureAnimationState()

        const { onChange } = _this.options
        const _offset = getOffset(_this.dragEl) // 获取拖拽元素的 offset 值

        // 元素发生位置交换时触发的回调
        if (onChange && typeof onChange === 'function') onChange(_this.differ.from, _this.differ.to, e, evt)
        
        // 优先比较 top 值，top 值相同再比较 left
        if (_offset.top < offset.top || _offset.left < offset.left) {
          _this.rootEl.insertBefore(_this.dragEl, el.nextElementSibling)
        } else {
          _this.rootEl.insertBefore(_this.dragEl, el)
        }

        _this.animateRange()
      }
    }
  }, 5),

  // -------------------------------- on drop ----------------------------------
  _onDrop: function(/** Event|TouchEvent */evt) {
    this._unbindMoveEvents()
    this._unbindUpEvents()
    clearTimeout(this.dragStartTimer)

    const { stopPropagation } = this.options
    stopPropagation && evt.stopPropagation() // 阻止事件冒泡
    evt.cancelable && evt.preventDefault()

    // clear style and class
    toggleClass(this.dragEl, this.options.chosenClass, false)
    this.dragEl.style['touch-action'] = ''
    this.dragEl.style['will-change'] = ''

    if (this.state.sortableDown && this.state.sortableMove) {
      // 重新获取一次拖拽元素的 offset 和 rect 值作为拖拽完成后的值
      this.differ.to.offset = getOffset(this.dragEl)
      this.differ.to.rect = getRect(this.dragEl)

      const { from, to } = this.differ
      // 通过 offset 比较是否进行了元素交换
      const changed = from.offset.top !== to.offset.top || from.offset.left !== to.offset.left
      // onDrop callback
      const { onDrop } = this.options
      if (onDrop && typeof onDrop === 'function') onDrop(changed, evt)

      this.ghost.destroy(to.rect)
    }
    this.differ.destroy()
    this.state = new State
    if (Safari) css(document.body, 'user-select', '')
  },

  // -------------------------------- auto scroll ----------------------------------
  _autoScroll: throttle(function(_this) {
    // check if is moving now
    if (!(_this.state.sortableDown && _this.state.sortableMove)) return
    const { clientX, clientY } = _this.state.sortableMove
    if (clientX === void 0 || clientY === void 0) return

    if (_this.scrollEl === _this.ownerDocument) {
      // does not support now
    } else {
      const { scrollTop, scrollLeft, scrollHeight, scrollWidth } = _this.scrollEl
      const { top, right, bottom, left, height, width } = getRect(_this.scrollEl)
      const { scrollStep, scrollThreshold } = _this.options
      // check direction
      const totop = scrollTop > 0 && clientY >= top && clientY <= (top + scrollThreshold)
      const toleft = scrollLeft > 0 && clientX >= left && clientX <= (left + scrollThreshold)
      const toright = (scrollLeft + width) < scrollWidth && clientX <= right && clientX >= (right - scrollThreshold)
      const tobottom = (scrollTop + height) < scrollHeight && clientY <= bottom && clientY >= (bottom - scrollThreshold)
      // scroll position
      const position = { x: scrollLeft, y: scrollTop }

      if (totop) {
        if (toleft) {
          // to top-left
          position.x = scrollLeft - scrollStep
        } else if (toright) {
          // to top-right
          position.x = scrollLeft + scrollStep
        } else {
          // to top
          position.x = scrollLeft
        }
        position.y = scrollTop - scrollStep
      } else if (tobottom) {
        if (toleft) {
          // to bottom-left
          position.x = scrollLeft - scrollStep
        } else if (toright) {
          // to bottom-right
          position.x = scrollLeft + scrollStep
        } else {
          // to bottom
          position.x = scrollLeft
        }
        position.y = scrollTop + scrollStep
      } else if (toleft) {
        // to left
        position.x = scrollLeft - scrollStep
        position.y = scrollTop
      } else if (toright) {
        // to right
        position.x = scrollLeft + scrollStep
        position.y = scrollTop
      }
      // if need to scroll
      if (totop || toleft || toright || tobottom) {
        requestAnimationFrame(() => {
          _this.scrollEl.scrollTo(position.x, position.y)
          _this._autoScroll(_this)
        })
      }
    }
  }, 10),

  // -------------------------------- clear ----------------------------------
  _removeSelection: function() {
    try {
      if (document.selection) {
        // Timeout neccessary for IE9
        _nextTick(() => { document.selection.empty() })
      } else {
        window.getSelection().removeAllRanges()
      }
    } catch (error) {
      //
    }
  },
  _clearState: function() {
    this.dragEl = null
    this.dropEl = null
    this.state = new State
    this.ghost.destroy()
    this.differ.destroy()
  }
}

Sortable.utils = {
  getRect,
  getOffset,
  debounce,
  throttle,
  getParentAutoScrollElement
}

export default Sortable
