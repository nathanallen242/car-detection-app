import React, { useState, useEffect, useRef, useCallback, useMemo, useContext } from 'react';
import {
View, TouchableOpacity, StyleSheet, Text, 
SafeAreaView, Modal, ActivityIndicator,
Platform, Animated, Image } from 'react-native';
import { FIREBASE_DB } from '../config/FireBase';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';
import { Camera } from 'expo-camera';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Audio } from 'expo-av';;
import { ImageContext } from '../contexts/ImageContext';
import { AuthContext } from '../contexts/AuthContext';
import { ref, set, push } from "firebase/database";
import * as ImagePicker from 'expo-image-picker';
import { EXPO_PRIVATE_API_URL, EXPO_NATIVE_URL, EXPO_APP_ID, EXPO_APP_TOKEN } from '@env';


const ScanScreen = ({ navigation }) => {
  // Existing states
  const [hasPermission, setHasPermission] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [zoom, setZoom] = useState(0);

  // Camera states
  const [type, setType] = useState(Camera.Constants.Type.back);
  const [flashMode, setFlashMode] = useState(Camera.Constants.FlashMode.off);
  const cameraRef = useRef(null);

  // Existing contexts
  const { addImage } = useContext(ImageContext);
  const { user } = useContext(AuthContext);

  // Modal-related states
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const successAnimation = useRef(new Animated.Value(0)).current;


  
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      console.log('Camera permission status: ', status);
      setHasPermission(status === 'granted');
    })();
  }, []);

  
  const flipCamera = () => {
    setType(
      type === Camera.Constants.Type.back
        ? Camera.Constants.Type.front
        : Camera.Constants.Type.back
    );
  };

  const toggleFlash = () => {
    setFlashMode(
      flashMode === Camera.Constants.FlashMode.off
        ? Camera.Constants.FlashMode.on
        : Camera.Constants.FlashMode.off
    );
  };

  const nav = useNavigation();

  const handleCapture = async () => {
    console.log('Capturing...');
    if (cameraRef.current) {
      let photo = await cameraRef.current.takePictureAsync();
      setCapturedImage(photo.uri); // Save the captured image URI
      setModalVisible(true); // Show the modal
   
      // Play a sound
      const soundObject = new Audio.Sound();
      try {
        await soundObject.loadAsync(require('../sounds/success.mp3'));
        await soundObject.playAsync();
      } catch (error) {
        console.log('Error playing sound: ', error);
      }
    }
   };
   
   const handleRetake = () => {
    setModalVisible(false);
    setCapturedImage(null);
    };

    const handleSend = async () => {
      setLoading(true);

      const formData = new FormData();
      formData.append('file', {
        uri: capturedImage,
        name: 'capturedImage.jpg',
        type: 'image/jpeg',
      });

      try {
        const response = await axios.post(EXPO_PRIVATE_API_URL, formData, {
          headers: {
            'Content-Type':'multipart/form-data',
          },
        });
      
      if (response.status === 200) {
        const prediction = response.data.prediction;
        const details = response.data.details;
        if (user) {
          const imageRef = push(ref(FIREBASE_DB, `users/${user.uid}/images`));
          await set(imageRef, { imageUri: capturedImage, prediction: prediction, details: details});
        }
        else {
          addImage(capturedImage, prediction, details);
        }
        setSuccess(true);
        Animated.timing(successAnimation, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }).start(() => {
          setSuccess(false);
          successAnimation.setValue(0);
          nav.navigate('Library');
          setModalVisible(false);
          setCapturedImage(null);
        });
        // Send push notification: TODO
        axios.post(EXPO_NATIVE_URL, {
          subID: user.uid,
          appId: EXPO_APP_ID,
          appToken: EXPO_APP_TOKEN,
          title: 'Prediction Successful!',
          message: `Predicted car: ${prediction}`
        });
      }
      setLoading(false);
    } catch (error) {
      console.log('Error sending file: ', error);
      setCapturedImage(null);
      setModalVisible(false);
    }
  };



  const getFlashIconStyle = () => {
    return flashMode === Camera.Constants.FlashMode.off
      ? { name: "flash", color: "grey" }
      : { name: "flash", color: "white" };
  };

  const onPinch = useCallback(
    (event) => {
      const velocity = event.velocity / 20;
      let newZoom =
          velocity > 0
              ? zoom + event.scale * velocity * (Platform.OS === 'ios' ? 0.01 : 25) // prettier-ignore
              : zoom - event.scale * Math.abs(velocity) * (Platform.OS === 'ios' ? 0.02 : 50); // prettier-ignore

      newZoom = Math.max(0, Math.min(newZoom, 1)); // Ensure newZoom is between 0 and 1
      setZoom(newZoom);
    },
    [zoom, setZoom]
  );

  const pinchGesture = useMemo(
    () => Gesture.Pinch().onUpdate(onPinch),
    [onPinch]
  );

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Sorry, we need camera roll permissions to make this work!');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setCapturedImage(result.assets[0].uri);
      setModalVisible(true);
    }
  };

  if (hasPermission === null) {
    return <View />;
  }
  if (hasPermission === false) {
    return <Text>No access to camera</Text>;
  }

  const { name, color } = getFlashIconStyle();


  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <GestureDetector gesture={pinchGesture}>
              <View style={styles.wrapper}>
              <Camera style={styles.preview} type={type} flashMode={flashMode} zoom={zoom} ref={cameraRef}>
                  <View style={styles.topBar}>
                  <TouchableOpacity style={styles.flashButton} onPress={toggleFlash}>
                      <FontAwesome name={name} size={35} color={color} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.flipButton} onPress={flipCamera}>
                      <FontAwesome name="refresh" size={35} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                    <FontAwesome name="photo" size={35} color="#FFF" />
                  </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
                      <FontAwesome name="circle-o" size={65} color="#FFF" />
                  </TouchableOpacity>
              </Camera>
              </View>
          </GestureDetector>
            <Modal
              animationType="slide"
              transparent={true}
              visible={modalVisible}
              onRequestClose={() => {
                setModalVisible(false);
                setCapturedImage(null);
              }}
              >
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => {
                  setModalVisible(false);
                }}
              >
              <View style={styles.modalContainer}>
                <Image
                style={styles.capturedImage}
                source={{ uri: capturedImage }}
                />
                <View style={styles.buttonContainer}>
                  <TouchableOpacity onPress={handleRetake} style={styles.button} disabled={loading}>
                    <Text style={styles.buttonText}>Retake</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSend} style={styles.button} disabled={loading}>
                    <Text style={styles.buttonText}>Predict</Text>
                  </TouchableOpacity>
                </View>
                {loading && <ActivityIndicator size="large" color="#0000ff" />}
                {success && (
                  <Animated.View style = {{ opacity: successAnimation }}>
                    <Text style={styles.successText}>Analysis successful! Redirecting to Library...</Text>
                  </Animated.View>
                )}
              </View>
            </TouchableOpacity>
          </Modal>
          </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  wrapper: {
    flex: 1,
  },
  preview: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  flipButton: {
    alignSelf: 'flex-end',
  },
  flashButton: {
    alignSelf: 'flex-start',
  },
  captureButton: {
    marginBottom: 30,
  },
  photoButton: {
    alignSelf: 'flex-end',
  },
  zoomSlider: {
    alignSelf: 'stretch',
  },
  capturedImage: {
    width: '70%', // Adjust as needed
    height: '50%', // Adjust as needed
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
   },
   modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    borderRadius: 10,
  },
  button: {
    backgroundColor: '#4CAF50',
    padding: 10,
    margin: 5,
    borderRadius: 5,
    width: '40%', // Adjust as needed
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
   buttonText: {
    color: 'white',
    fontSize: 20,
    textAlign: 'center',
   },
   successText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
   },
});

export default ScanScreen;
