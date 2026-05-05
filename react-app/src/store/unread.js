const MARK_UNREAD = 'unread/MARK_UNREAD';
const CLEAR_UNREAD = 'unread/CLEAR_UNREAD';

export const markUnread = () => ({ type: MARK_UNREAD });
export const clearUnread = () => ({ type: CLEAR_UNREAD });

const loadInitial = () => {
	try { return !!localStorage.getItem('tourit_has_unread'); }
	catch { return false; }
};

export default function reducer(state = loadInitial(), action) {
	switch (action.type) {
		case MARK_UNREAD:
			try { localStorage.setItem('tourit_has_unread', '1'); } catch {}
			return true;
		case CLEAR_UNREAD:
			try { localStorage.removeItem('tourit_has_unread'); } catch {}
			return false;
		default:
			return state;
	}
}
