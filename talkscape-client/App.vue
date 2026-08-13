<script>
	function applyBounceNone(webview) {
		if (!webview || typeof webview.setStyle !== 'function') return
		try {
			webview.setStyle({ bounce: 'none' })
		} catch (e) {}
	}

	function disableBounce() {
		if (typeof plus === 'undefined' || !plus.webview) return
		try {
			const current = plus.webview.currentWebview()
			applyBounceNone(current)
			const children = current && typeof current.children === 'function' ? current.children() : []
			;(children || []).forEach(applyBounceNone)
		} catch (e) {}
	}

	export default {
		onLaunch: function() {
			console.log('App Launch')
			disableBounce()
		},
		onShow: function() {
			console.log('App Show')
			disableBounce()
		},
		onHide: function() {
			console.log('App Hide')
		}
	}
</script>

<style>
	@import url('./static/common/main.css');
</style>
