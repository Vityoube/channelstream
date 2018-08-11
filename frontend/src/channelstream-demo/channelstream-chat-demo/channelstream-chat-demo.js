import {LitElement, html} from '@polymer/lit-element';
import {connect} from 'pwa-helpers/connect-mixin.js';
import '@polymer/paper-tabs/paper-tabs.js';
import '@polymer/app-layout/app-toolbar/app-toolbar.js';
import '../../debug.js';
import '../../channelstream-connection/channelstream-connection.js';
import '../app-views/admin-view/admin-view.js';
import '../app-views/chat-view/chat-view.js';
import {store} from '../redux/store.js';
import {actions as appActions} from '../redux/app';
import {actions as userActions} from '../redux/user';
import {actions as chatViewChannelActions} from '../redux/chat_view/channels';
import {actions as chatViewUsersActions} from '../redux/chat_view/users';
import {actions as chatViewMessagesActions} from '../redux/chat_view/messages';

class ChannelStreamChatDemo extends connect(store)(LitElement) {

    _render({user, page}) {
        let currentPage;
        if (page === 'chat'){ currentPage = html`<chat-view></chat-view>`};
        if (page === 'admin'){ currentPage =  html`<admin-view></admin-view>`};

        return html`
        <style>
            .pad-content {
                padding: 20px;
            }

            app-toolbar {
                background-color: #4285f4;
                color: #fff;
                margin: 0 0 20px 0;
            }

        </style>
        <channelstream-connection
                id="channelstream-connection"
                username=${user.username}
                channels=${user.subscribedChannels}
                on-channelstream-listen-message=${(e) => this.receivedMessage(e)}
                on-channelstream-connected=${(e) => this.handleConnected(e)}
                on-channelstream-subscribed=${(e) => this.handleSubscribed(e)}
                on-channelstream-unsubscribed=${(e) => this.handleUnsubscribed(e)}
                on-channelstream-channels-changed=${(e) => this.handleChannelsChange(e)}>
        </channelstream-connection>

        <app-toolbar>
            <span class="title">Channelstream Demo - Hello ${user.username}</span>

            <paper-tabs selected=${page} attr-for-selected="name" on-selected-changed=${(e) => this.changedTab(e)}>
                <paper-tab name="chat">Chat</paper-tab>
                <paper-tab name="admin">Admin Stats</paper-tab>
            </paper-tabs>
        </app-toolbar>

        <div class="pad-content">
            ${currentPage}
        </div>
        `
    }

    static get is() {
        return 'channelstream-chat-demo';
    }

    static get properties() {
        return {
            appConfig: Object,
            isReady: Boolean,
            user: Object,
            channels: Array,
            users: Object,
            page: String
        };
    }

    _stateChanged(state) {
        this.user = state.user;
        this.channels = state.chatView.channels;
        this.users = state.chatView.users;
        this.page = state.app.selectedPage;
    }

    constructor() {
        super();
        this.appConfig = window.AppConf;
    }

    changedTab(event) {
        store.dispatch(appActions.setPage(event.detail.value));
    }

    receivedMessage(event) {
        for (let message of event.detail.messages) {
            // add message
            // console.info('message', message);
            if ( message.type === 'message' || message.type === 'presence') {
                store.dispatch(chatViewMessagesActions.setChannelMessages({[message.channel]: [message]}));
            }
            if (message.type === 'message:edit') {
                console.log('message EDIT')
                // store.dispatch(chatViewMessagesActions.setChannelMessages({[message.channel]: [message]}));
            }
            if (message.type === 'message:delete') {
                console.log('message Delete')
                // store.dispatch(chatViewMessagesActions.setChannelMessages({[message.channel]: [message]}));
            }
            // update users on presence message
            if (message.type === 'presence') {
                // user joined
                if (message.message.action === 'joined') {
                    store.dispatch(chatViewUsersActions.setUserStates([{user: message.user, state: message.state}]));
                    store.dispatch(chatViewChannelActions.addChannelUsers(message.channel, [message.user]));
                }
                // user disconnected
                else {
                    store.dispatch(chatViewChannelActions.removeChannelUsers(message.channel, [message.user]));
                }
            }
            if (message.type === 'user_state_change') {
                store.dispatch(chatViewUsersActions.setUserStates([{user: message.user, state: message.message.state}]));
            }
        }
    }

    /** send the message via channelstream conn manager */
    messageSend(event) {
        this.getConnection().message(event.detail);
    }

    /** edit the message via channelstream conn manager */
    messageEdit(event){
        this.getConnection().edit(event.detail);
    }

    /** delete the message via channelstream conn manager */
    messageDelete(event) {
        this.getConnection().delete(event.detail);
    }
    
    changeStatus(event) {
        var stateUpdates = event.detail;
        this.getConnection().updateUserState({user_state: stateUpdates});
    }

    /** kicks off the connection */
    connectedCallback() {
        super.connectedCallback();
        var channelstreamConnection = this.shadowRoot.querySelector('channelstream-connection');
        channelstreamConnection.connectUrl = this.appConfig.connectUrl;
        channelstreamConnection.disconnectUrl = this.appConfig.disconnectUrl;
        channelstreamConnection.subscribeUrl = this.appConfig.subscribeUrl;
        channelstreamConnection.unsubscribeUrl = this.appConfig.unsubscribeUrl;
        channelstreamConnection.messageUrl = this.appConfig.messageUrl;
        channelstreamConnection.messageEditUrl = this.appConfig.messageEditUrl;
        channelstreamConnection.messageDeleteUrl = this.appConfig.messageDeleteUrl;
        channelstreamConnection.longPollUrl = this.appConfig.longPollUrl;
        channelstreamConnection.websocketUrl = this.appConfig.websocketUrl;
        channelstreamConnection.userStateUrl = this.appConfig.userStateUrl;
        // enable for tests
        // channelstreamConnection.noWebsocket = true;

        // add a mutator for demo purposes - modify the request
        // to inject some state vars to connection json
        channelstreamConnection.addMutator('connect', function (request) {
            request.body.state = {email: this.user.email, status: 'ready'};
        }.bind(this));
        channelstreamConnection.connect();

        this.addEventListener('channelpicker-subscribe', this.subscribeToChannel);
        this.addEventListener('change-status', this.changeStatus);
        this.addEventListener('message-send', this.messageSend);
        this.addEventListener('message-edit', this.messageEdit);
        this.addEventListener('message-delete', this.messageDelete);

    }

    disconnectedCallback() {
        super.disconnectedCallback();
    }

    _didRender(props, changedProps, prevProps){
        if (changedProps.user && prevProps.user){
            this.handleUserChange(changedProps.user, prevProps.user);
        }
    }

    /** creates new connection on name change */
    handleUserChange(newObj, oldObj) {
        if (oldObj.username === newObj.username) {
            return;
        }
        var connection = this.getConnection();
        connection.disconnect();
        connection.connect();
    }

    /** subscribes/unsubscribes users from channels in channelstream */
    handleChannelsChange(e) {
        console.log('handleChannelsChange', e.detail);
        var connection = this.getConnection();
        var shouldUnsubscribe = connection.calculateUnsubscribe();
        if (shouldUnsubscribe.length > 0) {
            connection.unsubscribe(shouldUnsubscribe);
        }
        else {
            connection.subscribe();
        }
    }

    getConnection() {
        return this.shadowRoot.querySelector('channelstream-connection');
    }

    handleConnected(event) {
        var data = event.detail.data;
        store.dispatch(userActions.setState(data.state));
        store.dispatch(userActions.setChannels(data.channels));
        store.dispatch(chatViewUsersActions.setUserStates(data.channels_info.users));
        store.dispatch(chatViewChannelActions.setChannelStates(data.channels_info.channels));
        let messageMappings = {};
        for (let channel of Object.entries(data.channels_info.channels)) {
            messageMappings[channel[0]] = channel[1].history;
        }
        store.dispatch(chatViewMessagesActions.setChannelMessages(messageMappings));
    }

    subscribeToChannel(event) {
        var connection = this.getConnection();
        var channel = event.detail.channel;
        var index = this.user.subscribedChannels.indexOf(channel);
        if (index !== -1) {
            var toUnsubscribe = connection.calculateUnsubscribe([channel]);
            connection.unsubscribe(toUnsubscribe);
        }
        else {
            var toSubscribe = connection.calculateSubscribe([channel]);
            connection.subscribe(toSubscribe);
        }
    }

    handleSubscribed(event) {
        console.log('handleSubscribed');
        var data = event.detail.data;
        var channelInfo = data.channels_info;
        store.dispatch(userActions.setChannels(data.channels));
        store.dispatch(chatViewUsersActions.setUserStates(channelInfo.users));
        store.dispatch(chatViewChannelActions.setChannelStates(channelInfo.channels));
        let messageMappings = {};
        for (let channel of Object.entries(channelInfo.channels)) {
            messageMappings[channel[0]] = channel[1].history;
        }
        store.dispatch(chatViewMessagesActions.setChannelMessages(messageMappings));
    }

    handleUnsubscribed(event) {
        var channelKeys = event.detail.data.unsubscribed_from;
        for (var i = 0; i < channelKeys.length; i++) {
            var key = channelKeys[i];
            store.dispatch(chatViewChannelActions.delChannelState(key));
        }
        store.dispatch(userActions.setChannels(event.detail.data.channels));
    }
}

customElements.define(ChannelStreamChatDemo.is, ChannelStreamChatDemo);
