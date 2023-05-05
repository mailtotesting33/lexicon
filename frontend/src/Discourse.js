/* @flow */
'use strict';

import React from 'react';
import { ThemeContext, themes } from './discourseHelper/ThemeContext';
import {
  Alert,
  Appearance,
  AppState,
  Linking,
  Platform,
  NativeModules,
  NativeEventEmitter,
  Settings,
  StatusBar,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import Screens from './screens/test';
import Site from './discourseHelper/site';
import SiteManager from './discourseHelper/site_manager';
import SafariView from 'react-native-safari-view';
import SafariWebAuth from 'react-native-safari-web-auth';
import DeviceInfo from 'react-native-device-info';
import firebase from './screens/firebase/helper';
import bgMessaging from './screens/firebase/bgMessaging';
import BackgroundFetch from 'react-native-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
// import RootViewBackgroundColor from 'react-native-root-view-background-color';
import { CustomTabs } from 'react-native-custom-tabs';
import { addShortcutListener } from 'react-native-siri-shortcut';
import { enableScreens } from 'react-native-screens';
import type { Notification, NotificationOpen } from './screens/firebase/helper';
import OneSignal from 'react-native-onesignal';

// const {DiscourseKeyboardShortcuts} = NativeModules;

// It's not ideal that we have to manually register languages here
// but react-native doesn't make it easy to loop through files in a folder
// there's react-native-fs, but I hesitate to add another dependency just for that
// i18n.translations = {
//   ar: require('./discourseHelper/locale/ar.json'),
//   de: require('./discourseHelper/locale/de.json'),
//   en: require('./discourseHelper/locale/en.json'),
//   es: require('./discourseHelper/locale/es.json'),
//   fi: require('./discourseHelper/locale/fi.json'),
//   fr: require('./discourseHelper/locale/fr.json'),
//   he: require('./discourseHelper/locale/he.json'),
//   hu: require('./discourseHelper/locale/hu.json'),
//   it: require('./discourseHelper/locale/it.json'),
//   ja: require('./discourseHelper/locale/ja.json'),
//   nl: require('./discourseHelper/locale/nl.json'),
//   // 'pt-BR': require('./locale/pt_BR.json'),
//   // ru: require('./locale/ru.json'),
//   // sv: require('./locale/sv.json'),
//   // 'zh-CN': require('./locale/zh_CN.json'),
//   // 'zh-TW': require('./locale/zh_TW.json'),
// };

// const {languageTag} = RNLocalize.findBestAvailableLanguage(
//   Object.keys(i18n.translations),
// ) || {languageTag: 'en', isRTL: false};

// i18n.locale = languageTag;
// i18n.fallbacks = true;

enableScreens();

// TODO: Use NativeStackNavigator instead?
const Stack = createStackNavigator();

class Discourse extends React.Component {
  refreshTimerId = null;

  constructor(props) {
    super(props);
    this._siteManager = new SiteManager();
    this._refresh = this._refresh.bind(this);

    const ONESIGNAL_APP_ID = '3c992628-f8c9-423e-bf55-43787c55c567'

    // OneSignal Initialization
    OneSignal.setAppId(ONESIGNAL_APP_ID);

    this._handleAppStateChange = nextAppState => {
      console.log('Detected appState change: ' + nextAppState);

      if (nextAppState.match(/inactive|background/)) {
        this._seenNotificationMap = null;
        clearTimeout(this.refreshTimerId);
      } else {
        StatusBar.setHidden(false);
        this._siteManager.refreshSites();

        clearTimeout(this.refreshTimerId);
        this.refreshTimerId = setTimeout(this._refresh, 30000);
      }
    };

    this._handleOpenUrl = this._handleOpenUrl.bind(this);

    if (Platform.OS === 'ios') {
      PushNotificationIOS.addEventListener('notification', e =>
        this._handleRemoteNotification(e),
      );
      // PushNotificationIOS.addEventListener("localNotification", e =>
      //   this._handleLocalNotification(e)
      // );

      PushNotificationIOS.addEventListener('register', s => {
        console.log('registered for push notifications', s);
        this._siteManager.registerClientId(s);
      });

      PushNotificationIOS.getInitialNotification().then(e => {
        if (e) {
          this._handleRemoteNotification(e);
        }
      });
    }

    if (Platform.OS === 'android') {
      const channel = new firebase.notifications.Android.Channel(
        'discourse',
        'Discourse',
        firebase.notifications.Android.Importance.Max,
      ).setDescription('Discourse notifications channel.');

      // Create the channel
      firebase.notifications().android.createChannel(channel);

      firebase
        .messaging()
        .getToken()
        .then(fcmToken => {
          if (fcmToken) {
            this._siteManager.registerClientId(fcmToken);
          }
        });

      this.onTokenRefreshListener = firebase
        .messaging()
        .onTokenRefresh(fcmToken => {
          if (fcmToken) {
            this._siteManager.registerClientId(fcmToken);
          }
        });
    }

    const colorScheme = Appearance.getColorScheme();

    this.state = {
      hasNotch: DeviceInfo.hasNotch(),
      deviceId: DeviceInfo.getDeviceId(),
      theme: colorScheme === 'dark' ? themes.dark : themes.light,
    };

    this.setRootBackground(colorScheme);

    this.subscription = Appearance.addChangeListener(() => {
      const newColorScheme = Appearance.getColorScheme();
      this.setRootBackground(newColorScheme);
      this.setState({
        theme: newColorScheme === 'dark' ? themes.dark : themes.light,
      });
    });

    // Toggle dark mode for older Androids (using a custom button in DebugRow)
    if (Platform.OS === 'android' && Platform.Version < 29) {
      AsyncStorage.getItem('@Discourse.androidLegacyTheme').then(
        storedTheme => {
          this.setState({
            theme:
              storedTheme && storedTheme === 'dark'
                ? themes.dark
                : themes.light,
          });
        },
      );
    }
  }

  setRootBackground(colorScheme) {
    if (Platform.OS === 'android') {
      return;
    }

    // if (colorScheme === 'dark') {
    //   RootViewBackgroundColor.setBackground(0, 0, 0, 1);
    // } else {
    //   RootViewBackgroundColor.setBackground(255, 255, 255, 1);
    // }
  }

  // _handleLocalNotification(e) {
  //   console.log("got local notification", e);
  //   if (
  //     AppState.currentState !== "active" &&
  //     e._data &&
  //     e._data.discourse_url
  //   ) {
  //     this.openUrl(e._data.discourse_url);
  //   }
  // }

  _handleRemoteNotification(e) {
    console.log('got remote notification', e);
    if (e._data && e._data.discourse_url) {
      this._siteManager
        .setActiveSite(e._data.discourse_url)
        .then(activeSite => {
          let supportsDelegatedAuth = false;
          if (this._siteManager.supportsDelegatedAuth(activeSite)) {
            supportsDelegatedAuth = true;
          }
          this.openUrl(e._data.discourse_url, supportsDelegatedAuth);
        });
    }
  }

  _handleOpenUrl(event) {
    console.log('_handleOpenUrl', event);

    if (event.url.startsWith('discourse://')) {
      let params = this.parseURLparameters(event.url);
      let site = this._siteManager.activeSite;

      if (Platform.OS === 'ios' && Settings.get('external_links_svc')) {
        SafariView.dismiss();
      }

      // initial auth payload
      if (params.payload) {
        this._siteManager.handleAuthPayload(params.payload);
      }

      // received one-time-password request from SafariView
      if (params.otp) {
        this._siteManager
          .generateURLParams(site, 'full')
          .then(generatedParams => {
            SafariWebAuth.requestAuth(
              `${site.url}/user-api-key/otp?${generatedParams}`,
            );
          });
      }

      // one-time-password received, launch site with it
      if (params.oneTimePassword) {
        const OTP = this._siteManager.decryptHelper(params.oneTimePassword);
        this.openUrl(`${site.url}/session/otp/${OTP}`);
      }

      // handle site URL passed via app-argument
      if (params.siteUrl) {
        if (this._siteManager.exists({ url: params.siteUrl })) {
          console.log(`${params.siteUrl} exists!`);
          this.openUrl(params.siteUrl);
        } else {
          console.log(`${params.siteUrl} does not exist, attempt adding`);
          Site.fromTerm(params.siteUrl)
            .then(newSite => {
              if (newSite) {
                this._siteManager.add(newSite);
              }
            })
            .catch(e => {
              console.log('Error adding site via app-argument:', e);
            });
        }
      }

      // handle shared URLs
      if (params.sharedUrl) {
        this._siteManager.setActiveSite(params.sharedUrl).then(activeSite => {
          if (activeSite.activeSite !== undefined) {
            let supportsDelegatedAuth = false;
            if (this._siteManager.supportsDelegatedAuth(activeSite)) {
              supportsDelegatedAuth = true;
            }
            this.openUrl(params.sharedUrl, supportsDelegatedAuth);
          } else {
            Alert.alert('Could not load that URL.');
          }
        });
      }
    }
  }
  componentDidMount() {

    // promptForPushNotificationsWithUserResponse will show the native iOS or Android notification permission prompt.
    // We recommend removing the following code and instead using an In-App Message to prompt for notification permission (See step 8)
    OneSignal.promptForPushNotificationsWithUserResponse();

    //Method for handling notifications received while app in foreground
    OneSignal.setNotificationWillShowInForegroundHandler(notificationReceivedEvent => {
      console.log("OneSignal: notification will show in foreground:", notificationReceivedEvent);
      let notification = notificationReceivedEvent.getNotification();
      console.log("notification: ", notification);
      const data = notification.additionalData
      console.log("additionalData: ", data);
      // Complete with null means don't show a notification.
      notificationReceivedEvent.complete(notification);
    });

    //Method for handling notifications opened
    OneSignal.setNotificationOpenedHandler(notification => {
      console.log("OneSignal: notification opened:", notification.notification.additionalData.discourse_url);
      this.openUrl(`https://community.bloom.pm${notification.notification.additionalData.discourse_url}`)
    });





    this._appStateSubscription = AppState.addEventListener(
      'change',
      this._handleAppStateChange,
    );

    this._handleOpenUrlSubscription = Linking.addEventListener(
      'url',
      this._handleOpenUrl,
    );

    Linking.getInitialURL().then(url => {
      if (url) {
        this._handleOpenUrl({ url: url });
      }
    });

    if (Platform.OS === 'ios') {
      PushNotificationIOS.requestPermissions({
        alert: true,
        badge: true,
        sound: true,
      });

      addShortcutListener(({ userInfo, activityType }) => {
        // Do something with the userInfo and/or activityType
        if (userInfo.siteUrl) {
          this._handleOpenUrl({
            url: `discourse://share?sharedUrl=${userInfo.siteUrl}`,
          });
        }
      });

      // this.eventEmitter = new NativeEventEmitter(DiscourseKeyboardShortcuts);
      // this.eventEmitter.addListener('keyInputEvent', res => {
      //   const {input} = res;

      //   if (input === 'W') {
      //     this._navigation.navigate('Home');
      //   } else {
      //     const index = parseInt(input, 10) - 1;
      //     const site = this._siteManager.getSiteByIndex(index);

      //     if (site) {
      //       this.openUrl(site.url);
      //     }
      //   }
      // });
    }

    if (Platform.OS === 'android') {
      // notification opened while app is in foreground or background
      this.removeNotificationOpenedListener = firebase
        .notifications()
        .onNotificationOpened((notificationOpen: NotificationOpen) => {
          console.log('onNotificationOpened');
          this.handleAndroidOpeNotification(notificationOpen);
        });

      // notification opened from closed app
      firebase
        .notifications()
        .getInitialNotification()
        .then((notificationOpen: NotificationOpen) => {
          console.log('getInitialNotification');
          this.handleAndroidOpeNotification(notificationOpen);
        });

      // notification received while in foreground
      this.foregroundNNotificationListener = firebase
        .notifications()
        .onNotification(notification => {
          bgMessaging(notification);
        });
    }

    // BackgroundFetch register (15-minute minimum interval allowed)
    BackgroundFetch.configure(
      { minimumFetchInterval: 15 },
      async taskId => {
        console.log('[js] Received background-fetch event: ', taskId);

        this._siteManager.refreshing = false;
        this._siteManager.refreshSites().then(() => {
          this._siteManager.updateUnreadBadge();
          // Required: Signal completion of your task to native code
          // If you fail to do this, the OS can terminate your app
          // or assign battery-blame for consuming too much background-time
          BackgroundFetch.finish(taskId);
        });
      },
      error => {
        console.log('[js] RNBackgroundFetch failed to start');
      },
    );

    clearTimeout(this.refreshTimerId);
    this.refreshTimerId = setTimeout(this._refresh, 30000);
  }

  async _refresh() {
    clearTimeout(this.refreshTimerId);
    await this._siteManager.refreshSites();
    this.refreshTimerId = setTimeout(this._refresh, 30000);
  }

  componentWillUnmount() {
    // this.eventEmitter?.removeAllListeners('keyInputEvent');
    this._appStateSubscription?.remove();
    this._handleOpenUrlSubscription?.remove();
    this.subscription?.remove();
    clearTimeout(this.safariViewTimeout);
    clearTimeout(this.refreshTimerId);

    if (Platform.OS === 'android') {
      this.removeNotificationOpenedListener();
      this.foregroundNNotificationListener();
    }
  }

  parseURLparameters(string) {
    let parsed = {};
    (string.split('?')[1] || string)
      .split('&')
      .map(item => {
        return item.split('=');
      })
      .forEach(item => {
        parsed[item[0]] = decodeURIComponent(item[1]);
      });
    return parsed;
  }

  handleAndroidOpeNotification(notificationOpen) {
    if (notificationOpen && notificationOpen.notification) {
      const notification: Notification = notificationOpen.notification;
      if (notification._data && notification._data.discourse_url) {
        this.openUrl(notification._data.discourse_url);
      }
    }
  }

  openUrl(url, supportsDelegatedAuth = true) {
    if (Platform.OS === 'ios') {
      if (!supportsDelegatedAuth) {
        this.safariViewTimeout = setTimeout(() => SafariView.show({ url }), 400);
      } else {
        SafariView.dismiss();

        this._navigation.navigate('WebView', {
          url: url,
        });
      }
    }

    if (Platform.OS === 'android') {
      AsyncStorage.getItem('@Discourse.androidCustomTabs').then(value => {
        if (value) {
          CustomTabs.openURL(url, {
            enableUrlBarHiding: true,
            showPageTitle: false,
          }).catch(err => {
            console.error(err);
          });
        } else {
          Linking.openURL(url);
        }
      });
    }
  }

  _toggleTheme(newTheme) {
    this.setState({
      theme: newTheme === 'dark' ? themes.dark : themes.light,
    });
  }

  render() {
    // TODO: pass only relevant props to each screen component
    const screenProps = {
      openUrl: this.openUrl.bind(this),
      _handleOpenUrl: this._handleOpenUrl,
      seenNotificationMap: this._seenNotificationMap,
      setSeenNotificationMap: map => {
        this._seenNotificationMap = map;
      },
      siteManager: this._siteManager,
      hasNotch: this.state.hasNotch,
      deviceId: this.state.deviceId,
      toggleTheme: this._toggleTheme.bind(this),
    };

    return (
      <NavigationContainer>
        <ThemeContext.Provider value={this.state.theme}>
          <StatusBar barStyle={this.state.theme.barStyle} />
          <Stack.Navigator
            initialRouteName="Home"
            presentation="modal"
            screenOptions={({ navigation }) => {
              this._navigation = navigation;
              return {
                headerShown: false,
                ...TransitionPresets.ModalSlideFromBottomIOS,
              };
            }}>
            <Stack.Screen name="Home">
              {props => (
                <Screens.Home {...props} screenProps={{ ...screenProps }} />
              )}
            </Stack.Screen>
            <Stack.Screen name="Notifications">
              {props => (
                <Screens.Notifications
                  {...props}
                  screenProps={{ ...screenProps }}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="Settings">
              {props => (
                <Screens.Settings {...props} screenProps={{ ...screenProps }} />
              )}
            </Stack.Screen>
            <Stack.Screen name="WebView">
              {props => (
                <Screens.WebView {...props} screenProps={{ ...screenProps }} />
              )}
            </Stack.Screen>
          </Stack.Navigator>
        </ThemeContext.Provider>
      </NavigationContainer>
    );
  }
}

export default Discourse;
