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
  this.ownerDocument = el.ownerDocument,
  this.options = options = Object.assign({}, options)

  const defaults = {
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

  Object.assign(this, Animation(), Events())

  this._onStart = this._onStart.bind(this)
  this._onMove = this._onMove.bind(this)
  this._onDrop = this._onDrop.bind(this)
  this._bindEventListener()
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

  // -------------------------------- prepare start ----------------------------------
  _onStart: function(/** Event|TouchEvent */evt) {
    const { delay, disabled, stopPropagation, delayOnTouchOnly } = this.options
    if (/mousedown|pointerdown/.test(evt.type) && evt.button !== 0 || disabled) return // only left button and enabled

    const touch = (evt.touches && evt.touches[0]) || (evt.pointerType && evt.pointerType === 'touch' && evt)
    const e = touch || evt

    // Safari ignores further event handling after mousedown
		if (!this.nativeDraggable && Safari && e.target && e.target.tagName.toUpperCase() === 'SELECT') return
    if (e.target === this.rootEl) return true

    if (stopPropagation) evt.stopPropagation()

    if (delay && (!delayOnTouchOnly || touch) && (!this.nativeDraggable || !(Edge || IE11OrLess))) {
      this.dragStartTimer = setTimeout(this._onDrag(e, touch), delay)
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

    this.removeSelection()

    // 获取拖拽元素                 
    if (dragging) {
      if (typeof dragging === 'function') this.dragEl = dragging(e)
      else throw new Error(`dragging expected "function" or "string" but received "${typeof dragging}"`)
    } else {
      this.dragEl = getElement(this.rootEl, e.target, true)
    }

    // 不存在拖拽元素时不允许拖拽
    if (!this.dragEl || this.dragEl.animated) return true

    // 解决移动端无法拖拽问题
    css(this.dragEl, 'touch-action', 'none')

    // 获取拖拽元素在列表中的位置
    const { rect, offset } = getElement(this.rootEl, this.dragEl)
    this.move = {
      x: e.clientX,
      y: e.clientY
    }
    this.ghost.distance = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
    this.differ.from = { node: this.dragEl, rect, offset}
    this.state.sortableDown = true

    this._bindMoveEvents(touch)
    this._bindUpEvents(touch)
  },
  
  // -------------------------------- is started ----------------------------------
  _onStarted: function(e, /** originalEvent */evt) {
    const { onDrag } = this.options
    const { rect } = this.differ.from
    // 将初始化放到move事件中，防止与click事件冲突
    if (!this.ghost.$el) {
      this.ghost.init(this.dragEl.cloneNode(true), rect)

      // onDrag callback
      if (onDrag && typeof onDrag === 'function') onDrag(this.dragEl, e, evt)
    }
    if (Safari) {
			css(document.body, 'user-select', 'none');
		}
  },

  // -------------------------------- on move ----------------------------------
  _onMove: function(/** Event|TouchEvent */evt) {
    const touch = (evt.touches && evt.touches[0]) || (evt.pointerType && evt.pointerType === 'touch' && evt)
    const e = touch || evt
    const { clientX, clientY } = e
    const target = touch ? document.elementFromPoint(clientX, clientY) : e.target

    const distanceX = clientX - this.move.x
    const distanceY = clientY - this.move.y

    if ((clientX !== void 0 && Math.abs(distanceX) <= 0) && (clientY !== void 0 && Math.abs(distanceY) <= 0)) {
      return
    }

    const { chosenClass, stopPropagation, onMove } = this.options

    stopPropagation && evt.stopPropagation && evt.stopPropagation() // 阻止事件冒泡
    evt.preventDefault !== void 0 && evt.cancelable && evt.preventDefault() // prevent scrolling

    this._onStarted(e, evt)
    
    this.ghost.move(distanceX, distanceY)
    // 拖拽过程中触发的回调
    if (onMove && typeof onMove === 'function') onMove(this.differ.from, this.ghost.$el, e, evt)

    toggleClass(this.dragEl, chosenClass, true)

    if (!this.state.sortableDown) return
    if (clientX < 0 || clientY < 0) return

    this.state.sortableMove = true

    // 判断边界值
    const rc = getRect(this.rootEl)

    if (clientX < rc.left || clientX > rc.right || clientY < rc.top || clientY > rc.bottom) {
      return
    }

    this._onChange(this, target, e, evt)
  },
  _onChange: throttle(function(_this, target, e, evt) {
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
  }, 10),

  // -------------------------------- on drop ----------------------------------
  _onDrop: function(/** Event|TouchEvent */evt) {
    this._unbindMoveEvents()
    this._unbindUpEvents()
    clearTimeout(this.dragStartTimer)

    const { onDrop, chosenClass, stopPropagation } = this.options

    stopPropagation && evt.stopPropagation() // 阻止事件冒泡
    evt.cancelable && evt.preventDefault()

    toggleClass(this.dragEl, chosenClass, false)
    css(this.dragEl, 'touch-action', '')

    if (this.state.sortableDown && this.state.sortableMove) {

      // 重新获取一次拖拽元素的 offset 和 rect 值作为拖拽完成后的值
      this.differ.to.offset = getOffset(this.dragEl)
      this.differ.to.rect = getRect(this.dragEl)

      const { from, to } = this.differ

      // 通过 offset 比较是否进行了元素交换
      const changed = from.offset.top !== to.offset.top || from.offset.left !== to.offset.left
      
      // onDrop callback
      if (onDrop && typeof onDrop === 'function') onDrop(changed, evt)

      this.ghost.destroy(to.rect)
    }
    // Safari
    if (Safari) css(document.body, 'user-select', '')
    this.differ.destroy()
    this.state = new State
  },

  // -------------------------------- clear ----------------------------------
  removeSelection() {
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

export default Sortable
